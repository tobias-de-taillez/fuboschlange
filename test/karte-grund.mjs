// Prueft M0 raumskizze-karte-grund.js (ARCHITEKTUR v3, 17.1): Rahmen und Gier (1.1/1.2),
// Waende, Hysterese, Robustkern, Stuetzstellen (gBei) und die duennbesetzte LDL^T gegen
// eine dichte Loesung. Laedt vendor + geo von raumskizze-probe.html wie
// raumskizze-protokoll.mjs und fuegt die Moduldatei als eigenen Block vor
// globalThis.RAUMSKIZZE=G; ein (wie raumskizze-aufnahme.mjs die Senkrechte).
//
//   node test/karte-grund.mjs            (RAUMSKIZZE_HTML=pfad: anderer Stand der Seite)
import {readFileSync, existsSync} from 'node:fs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
const DATEI='raumskizze-karte-grund.js', src=read(DATEI);
const mark='globalThis.RAUMSKIZZE=G;';
let geo=pick('geo'); const at=geo.lastIndexOf(mark); if(at<0) throw new Error('geo-Block ohne '+mark);
// Traegt die Seite das Modul schon wortgleich, gilt die Seite; sonst wird es eingefuegt.
const traegt=geo.includes('{\n'+src+'}\n');
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G0keys=new Set(Object.keys(globalThis.RAUMSKIZZE));
if(!traegt) geo=geo.slice(0, at)+'{\n'+src+'\n}\n'+geo.slice(at);
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G=globalThis.RAUMSKIZZE;

const out=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const D2R=Math.PI/180, R2D=180/Math.PI, e=x=>Number.isFinite(x) ? x.toExponential(1) : String(x), f2=x=>Number.isFinite(x) ? x.toFixed(2) : String(x);
const wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const maxAbs=(a,b)=>{ let m=0; for(let i=0;i<a.length;i++) m=Math.max(m, Math.abs(a[i]-b[i])); return m; };
const rnd=G.KG.rnd(20261025), U=(a,b)=>a+(b-a)*rnd();
const zufallG=()=>({psi:U(-Math.PI, Math.PI), tx:U(-5,5), ty:U(-0.5,0.5), tz:U(-5,5)});
const Tmat=(Tpsi,Tx,Ty,Tz)=>{ const c=Math.cos(Tpsi), s=Math.sin(Tpsi); return [c,0,-s,0, 0,1,0,0, s,0,c,0, Tx,Ty,Tz,1]; };
const m4q=(p,[x,y,z,w])=>[1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
  2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  p[0], p[1], p[2], 1];

// ------------------------------------------------- Datei und Einbau
{
  const NAMEN=['KG','gMat','gAnw','gInv','gKomp','gAusT','gPlan','psiAusTpsi','blickPlan','ankerPlan','wandN','wandU','wandSchnitt',
    'wandSeite','zuBezug','fokusPx','hyst','gmGewicht','gBei','ldlOrdnung','ldlSymb','ldlNum','ldlLoes'];
  const Gs={}; let fehler=null; try{ new Function('G', '"use strict";\n'+src)(Gs); }catch(x){ fehler=x.message; }
  const neu=Object.keys(Gs).sort(), soll=[...NAMEN].sort();
  chk('Datei laedt allein (new Function, ohne geo-Kern) und haengt genau die Namen aus 4 an G', !fehler && JSON.stringify(neu)===JSON.stringify(soll),
    fehler || neu.filter(k=>!NAMEN.includes(k)).concat(NAMEN.filter(k=>!neu.includes(k))).join(',') || neu.length+' Namen');
  const kollision=NAMEN.filter(k=>G0keys.has(k));
  chk('keine Kollision mit Namen, die der geo-Block schon traegt', !kollision.length, kollision.join(',') || (traegt ? 'Seite traegt das Modul' : 'eingefuegt'));
  chk('Datei endet mit genau einem Zeilenumbruch, kein import/export/</script>', /[^\n]\n$/.test(src) && !/^\s*(import|export)\s/m.test(src) && !src.includes('</script>'));
  const verboten=[/Math\.random/, /Date\.now/, /performance\.now/, /\bwindow\b/, /\bdocument\b/, /\bself\b/].filter(r=>r.test(src.replace(/\/\/.*$/gm, '')));
  chk('kein Math.random, keine Uhr, kein DOM/Worker-Global im Code (2)', !verboten.length, verboten.map(String).join(' '));
  // 1.2: kein anderes Kartenmodul ruft atan2 auf Matrixeintraege auf.
  const MODULE=['raumskizze-segmente.js','raumskizze-abschnitte.js','raumskizze-landmarken.js','raumskizze-ausgleich.js','raumskizze-umriss.js',
    'raumskizze-ringe.js','raumskizze-tiefe.js','raumskizze-kartenlauf.js'];
  const da=MODULE.filter(f=>existsSync(new URL('../'+f, import.meta.url)));
  const treffer=da.filter(f=>/atan2\s*\([^)]*\b(m|camTo|pose|T|M|mat)\s*\[\s*(0|2|8|10)\s*\]/.test(read(f).replace(/\/\/.*$/gm, '')));
  chk('atan2 auf Matrixeintraege nur in M0 (Suche ueber vorhandene Kartenmodule)', !treffer.length, treffer.join(', ') || `${da.length} Module vorhanden`);
}

// ------------------------------------------------- Konstanten
{
  const K=G.KG;
  chk('G.KG: SEG 10, KL {X0,V1,O2,U3}, EPS 1e-9, KNOTEN wie 4', K.SEG===10 && K.KL.X===0 && K.KL.V===1 && K.KL.O===2 && K.KL.U===3 && K.EPS===1e-9 &&
    JSON.stringify(K.KNOTEN)===JSON.stringify({dT:15, dS:3.0, minBeob:30, minRicht:2, richtDeg:60, sP0:0.005, kP:0.010, sY0Deg:0.05, kYDeg:0.10, sH0:0.002, kH:0.002, chiRest:16, rundenRest:2}));
  const a=K.rnd(7), b=K.rnd(7), c=K.rnd(8), A=[], B=[], C=[]; for(let i=0;i<10000;i++){ A.push(a()); B.push(b()); C.push(c()); }
  const mean=A.reduce((s,x)=>s+x,0)/A.length;
  chk('KG.rnd: gleicher Samen gleiche Folge, anderer Samen andere, Werte in [0, 1), Mittel ~0,5',
    A.every((x,i)=>x===B[i]) && A.some((x,i)=>x!==C[i]) && A.every(x=>x>=0 && x<1) && Math.abs(mean-0.5)<0.01, `Mittel ${mean.toFixed(4)}`);
}

// ------------------------------------------------- Versatz g
{
  let m1=0, m2=0, m3=0, m4=0, m5=0;
  for(let i=0;i<100;i++){ const g=zufallG(), h=zufallG();
    const I1=G.gKomp(g, G.gInv(g)), I2=G.gKomp(G.gInv(g), g);
    m1=Math.max(m1, ...[I1, I2].flatMap(x=>[Math.abs(x.psi), Math.abs(x.tx), Math.abs(x.ty), Math.abs(x.tz)]));
    m2=Math.max(m2, maxAbs(G.gMat(G.gKomp(g,h)), G.m4mul(G.gMat(g), G.gMat(h))));
    const P=[U(-5,5), U(-1,3), U(-5,5)];
    m3=Math.max(m3, maxAbs(G.gAnw(g,P), G.m4vec(G.gMat(g), [...P, 1]).slice(0,3)));
    const p=G.gPlan(g, [P[0], P[2]]), q=G.gAnw(g, P); m4=Math.max(m4, Math.abs(p[0]-q[0]), Math.abs(p[1]-q[2]));
    m5=Math.max(m5, maxAbs(G.gMat(G.gInv(g)), G.m4inv(G.gMat(g)))); }
  chk('gKomp(g, gInv(g)) = Einheit fuer 100 Zufalls-g (beide Seiten, 1e-12)', m1<1e-12, e(m1));
  chk('gKomp(a, b): gMat(a∘b) = gMat(a)·gMat(b) (erst b, dann a; 1e-12)', m2<1e-12, e(m2));
  chk('gAnw = gMat·P, gPlan = (x, z) von gAnw, gMat(gInv(g)) = gMat(g)^-1 (1e-12)', m3<1e-12 && m4<1e-12 && m5<1e-12, `${e(m3)} / ${e(m4)} / ${e(m5)}`);
  const g=G.gMat({psi:0.3, tx:1, ty:2, tz:3});
  chk('gMat wie 1.1: [cs,0,sn,0, 0,1,0,0, -sn,0,cs,0, tx,ty,tz,1]', g instanceof Float64Array && g.length===16 &&
    maxAbs(g, [Math.cos(0.3),0,Math.sin(0.3),0, 0,1,0,0, -Math.sin(0.3),0,Math.cos(0.3),0, 1,2,3,1])===0);
}

// ------------------------------------------------- Gier (1.2): Selbsttest 0.1
{
  const Tpsi=10*D2R, T=Tmat(Tpsi, 0.3, -1.25, -0.2);
  const d=maxAbs(G.gMat({psi:G.psiAusTpsi(Tpsi), tx:0.3, ty:-1.25, tz:-0.2}), T);
  chk('Tpsi-Test 1.2: max|gMat({psi:psiAusTpsi(+10°), tx:0,3, tz:-0,2}) - T| < 1e-12', d<1e-12, e(d));
  const a=G.gAusT(T), b=G.gAusT([Tpsi, 0.3, -1.25, -0.2]);
  chk('gAusT aus 4x4 und aus [Tpsi, Tx, Ty, Tz] gleich, psi = -Tpsi', Math.abs(a.psi+Tpsi)<1e-15 && Math.abs(b.psi+Tpsi)<1e-15 &&
    Math.abs(a.tx-0.3)+Math.abs(a.ty+1.25)+Math.abs(a.tz+0.2)<1e-15 && b.tx===0.3 && b.ty===-1.25 && b.tz===-0.2, `psi ${(a.psi*R2D).toFixed(12)}°`);
  const I=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], R10=Tmat(Tpsi,0,0,0);
  chk('blickPlan: Pose = Einheit -> -90°, nach R_y(+10°) -> -100°', Math.abs(G.blickPlan(I)*R2D+90)<1e-12 && Math.abs(G.blickPlan(R10)*R2D+100)<1e-12,
    `${(G.blickPlan(I)*R2D).toFixed(6)}° / ${(G.blickPlan(R10)*R2D).toFixed(6)}°`);
  chk('ankerPlan(psi) = -psi (Gier wie Tpsi)', G.ankerPlan(0.25)===-0.25 && G.psiAusTpsi(-0.5)===0.5);
  // gMat dreht die Plan-Gier jeder Kamera um +psi; Bindung 'pose' (3.2.1) haelt die Kamera in F0 fest.
  let mb=0, mk=0;
  for(let i=0;i<100;i++){ const g=zufallG(), q=[U(-1,1),U(-1,1),U(-1,1),U(-1,1)], n=Math.hypot(...q), Pose=m4q([U(-3,3),U(0,2),U(-3,3)], q.map(x=>x/n));
    mb=Math.max(mb, Math.abs(wrap(G.blickPlan(G.m4mul(G.gMat(g), Pose))-G.blickPlan(Pose)-g.psi)));
    const TA=Tmat(U(-3,3),U(-2,2),U(-1.5,-1),U(-2,2)), TB=Tmat(U(-3,3),U(-2,2),U(-1.5,-1),U(-2,2));
    const gB=G.gKomp(g, G.gKomp(G.gInv(G.gAusT(TA)), G.gAusT(TB)));
    mk=Math.max(mk, maxAbs(G.m4mul(G.gMat(gB), G.m4mul(G.m4inv(TB), Pose)), G.m4mul(G.gMat(g), G.m4mul(G.m4inv(TA), Pose)))); }
  chk('blickPlan(gMat(g)·m) = blickPlan(m) + g.psi fuer 100 Zufallsposen', mb<1e-12, e(mb));
  chk('Bindung nurT: g_B = g_A ∘ gAusT(T_A)^-1 ∘ gAusT(T_B) haelt camTo in F0 fest (100 Zufallsfaelle, 1e-12)', mk<1e-12, e(mk));
  // A6 75,11 s (Relokalisierung): Zeilen aus zustand.jsonl von Aufnahme 6 (t, px..qw, Tpsi, Tx, Ty, Tz), Vorlage rev/gier.mjs.
  const ra=[75.015,0.8035,0.3152,0.0847,0.07415,-0.61179,0.05592,0.78555,0.00449,1.0421,-1.2494,2.1951],
        rb=[75.108,1.1821,0.383,-0.6682,0.08606,-0.48415,0.04355,0.86965,0.31005,1.7229,-1.2827,1.4884];
  const Pa=m4q(ra.slice(1,4), ra.slice(4,8)), Pb=m4q(rb.slice(1,4), rb.slice(4,8));
  const dBlick=wrap(G.blickPlan(Pb)-G.blickPlan(Pa)), dT=G.psiAusTpsi(rb[8]-ra[8]);
  const ca=G.m4mul(G.m4inv(G.gMat(G.gAusT(ra.slice(8)))), Pa), cb=G.m4mul(G.m4inv(G.gMat(G.gAusT(rb.slice(8)))), Pb);
  chk('A6 75,11 s: Differenz blickPlan(Pose) = psiAusTpsi(ΔTpsi) ± 0,2°', Math.abs(wrap(dBlick-dT))*R2D<=0.2,
    `Pose ${f2(dBlick*R2D)}°, psiAusTpsi(ΔTpsi) ${f2(dT*R2D)}°, Rest ${(Math.abs(wrap(dBlick-dT))*R2D).toFixed(3)}°; camTo ${f2(wrap(G.blickPlan(cb)-G.blickPlan(ca))*R2D)}°`);
}

// ------------------------------------------------- Waende
{
  // Pfeiler I-J-AC-AD der Wahrheit (m): Seite J-AC zeigt nach -z (zur Kueche), Seite AD-I nach +z.
  const J=[2.5609301638811635, 5.187022569363462], AC=[2.956331445855096, 5.189387988099445], I=[2.567742355877811, 5.552977975270456], AD=[2.968900784073865, 5.563868324948963];
  const wand=(A,B,frei)=>{ const ex=B[0]-A[0], ez=B[1]-A[1], L=Math.hypot(ex,ez); let n=[-ez/L, ex/L]; if(n[0]*(frei[0]-A[0])+n[1]*(frei[1]-A[1])<0) n=[-n[0], -n[1]];
    let phi=Math.atan2(n[1], n[0]); if(phi<0) phi+=2*Math.PI; return {phi, rho:n[0]*A[0]+n[1]*A[1]}; };
  const mitte=[(J[0]+AC[0]+I[0]+AD[0])/4, (J[1]+AC[1]+I[1]+AD[1])/4];
  const Wjac=wand(J, AC, [mitte[0], 0]), Wadi=wand(AD, I, [mitte[0], 9]), vor=[2.75, 4.0], hinter=[2.75, 6.5];
  const s1=G.wandSeite(Wjac, vor), s2=G.wandSeite(Wjac, hinter), s3=G.wandSeite(Wadi, hinter), s4=G.wandSeite(Wadi, vor);
  chk('wandSeite am Pfeiler: Kamera vor J-AC > 0,1 m, hinter dem Pfeiler < 0; Gegenflaeche AD-I umgekehrt, phi um ~pi versetzt',
    s1>0.1 && s2<0 && s3>0.1 && s4<0 && Math.abs(Math.abs(wrap(Wjac.phi-Wadi.phi))-Math.PI)<3*D2R && G.wandSeite(Wjac, mitte)<0,
    `${f2(s1)} / ${f2(s2)} / ${f2(s3)} / ${f2(s4)} m, Δphi ${f2(Math.abs(wrap(Wjac.phi-Wadi.phi))*R2D)}°`);
  const n=G.wandN(1.1), u=G.wandU(1.1);
  chk('wandN/wandU: Einheitsvektoren, u = n um +90° gedreht', Math.abs(Math.hypot(...n)-1)<1e-15 && Math.abs(n[0]*u[0]+n[1]*u[1])<1e-15 && Math.abs(n[0]*u[1]-n[1]*u[0]-1)<1e-15);
  let ms=0; for(let i=0;i<100;i++){ const a={phi:U(0,2*Math.PI), rho:U(-5,5)}, b={phi:a.phi+U(0.2, 2.9)*(rnd()<0.5?1:-1), rho:U(-5,5)}, p=G.wandSchnitt(a,b);
    ms=Math.max(ms, Math.abs(G.wandSeite(a,p)), Math.abs(G.wandSeite(b,p))); }
  const p0=G.wandSchnitt({phi:0, rho:1}, {phi:Math.PI/2, rho:2});
  chk('wandSchnitt: x = 1 und z = 2 schneiden in (1, 2); 100 Zufallspaare liegen auf beiden Linien; parallel -> null',
    Math.abs(p0[0]-1)<1e-15 && Math.abs(p0[1]-2)<1e-15 && ms<1e-12 && G.wandSchnitt({phi:0.3, rho:1}, {phi:0.3, rho:2})===null && G.wandSchnitt({phi:0.3, rho:1}, {phi:0.3+Math.PI, rho:2})===null, e(ms));
}

// ------------------------------------------------- zuBezug
{
  const g=zufallG();
  const stand={waende:[{id:1, phi:0.4, rho:2.5, cov:[1e-4, 2e-5, 4e-4], iv:[{s0:-1, s1:0.5, n:3}], boden:[{s0:-0.8, s1:0.2, n:2}], sSchwer:-0.2, cls:'wand'},
                       {id:2, phi:5.9, rho:-1.2, cov:[3e-4, -1e-5, 1e-4], iv:[{s0:0.2, s1:2.2, n:5}], cls:'wand'}],
    ecken:[{id:7, p:[1.5, -2.0], cov:[4e-4, 1e-4, 9e-4], art:'konkav'}], ringe:[{id:'r0', art:'aussen', pts:[[0,0],[3,0],[3,2],[0,2]]}]};
  const B=G.zuBezug(stand, g), gi=G.gInv(g);
  let mL=0, mS=0;
  for(let k=0;k<stand.waende.length;k++){ const W=stand.waende[k], Wb=B.waende[k], n=G.wandN(W.phi), u=G.wandU(W.phi), ub=G.wandU(Wb.phi);
    for(const s of [W.iv[0].s0, W.iv[0].s1]){ const p=[W.rho*n[0]+s*u[0], W.rho*n[1]+s*u[1]], q=G.gPlan(gi, p);
      mL=Math.max(mL, Math.abs(G.wandSeite(Wb, q))); const sb=ub[0]*q[0]+ub[1]*q[1]; mS=Math.min(1, Math.max(mS, Math.min(Math.abs(sb-Wb.iv[0].s0), Math.abs(sb-Wb.iv[0].s1)))); } }
  const zurueck=G.zuBezug(B, G.gInv(g));
  const dW=Math.max(...stand.waende.map((W,k)=>{ const Z=zurueck.waende[k]; return Math.max(Math.abs(wrap(Z.phi-W.phi)), Math.abs(Z.rho-W.rho), maxAbs(Z.cov, W.cov), maxAbs([Z.iv[0].s0, Z.iv[0].s1], [W.iv[0].s0, W.iv[0].s1])); }));
  const dE=Math.max(maxAbs(zurueck.ecken[0].p, stand.ecken[0].p), maxAbs(zurueck.ecken[0].cov, stand.ecken[0].cov), maxAbs(zurueck.ringe[0].pts.flat(), stand.ringe[0].pts.flat()));
  chk('zuBezug: Punkte der F0-Linie liegen auf der Linie im Bezug, Intervalle verschoben, phi in [0, 2pi)', mL<1e-12 && mS<1e-12 && B.waende.every(W=>W.phi>=0 && W.phi<2*Math.PI), `${e(mL)} / ${e(mS)}`);
  chk('zuBezug hin und mit gInv(g) zurueck = Eingang (Waende inkl. cov und iv, Ecken inkl. cov, Ringe)', dW<1e-12 && dE<1e-12, `${e(dW)} / ${e(dE)}`);
  // Kovarianz gegen numerische Jacobi
  const W=stand.waende[0], h=1e-5, fW=(phi,rho)=>{ const r=G.zuBezug({waende:[{phi, rho}]}, g).waende[0]; return [r.phi, r.rho]; };
  const fa=fW(W.phi+h, W.rho), fA=fW(W.phi-h, W.rho), fb=fW(W.phi, W.rho+h), fB=fW(W.phi, W.rho-h);
  const Jm=[[(fa[0]-fA[0])/(2*h), (fb[0]-fB[0])/(2*h)], [(fa[1]-fA[1])/(2*h), (fb[1]-fB[1])/(2*h)]];
  const C=[[W.cov[0], W.cov[1]], [W.cov[1], W.cov[2]]], JC=[0,1].map(i=>[0,1].map(j=>Jm[i][0]*C[0][j]+Jm[i][1]*C[1][j])), JCJ=[0,1].map(i=>[0,1].map(j=>JC[i][0]*Jm[j][0]+JC[i][1]*Jm[j][1]));
  const dc=maxAbs([JCJ[0][0], JCJ[0][1], JCJ[1][1]], B.waende[0].cov)/Math.max(...B.waende[0].cov.map(Math.abs));
  chk('zuBezug: Wand-Kovarianz = J·C·J^T der Abbildung (numerische Jacobi, zentral, relativ 1e-6)', dc<1e-6, e(dc));
  chk('zuBezug laesst den Eingang unveraendert und gibt neue Objekte', stand.waende[0].rho===2.5 && B.waende[0]!==stand.waende[0] && stand.ecken[0].p[0]===1.5);
}

// ------------------------------------------------- Kleinkram
{
  const projA6=[3.212766170501709,0,0,0, 0,1.4398952722549438,0,0, 0,0,-1.0001999139785767,-1, 0,0,-0.2000199854373932,0];
  const f=G.fokusPx(projA6, 640);
  chk('fokusPx(proj A6, 640) = proj[5]·640/2 ≈ 460,8 px (R16)', Math.abs(f-460.77)<0.01, f2(f));
  let st=false; const seq=[0.2, 0.5, 0.45, 0.3].map(v=>(st=G.hyst(st, v, 0.5, 0.4, '>=')));
  let sp=false; const seqP=[0.6, 0.45, 0.5, 0.55, 0.56, 0.44].map(v=>(sp=G.hyst(sp, v, 0.45, 0.55, '<=')));
  chk('hyst: Folge 0,2/0,5/0,45/0,3 bei setzen 0,5 / loesen 0,4 -> aus, an, an, aus', JSON.stringify(seq)===JSON.stringify([false, true, true, false]), seq.join(','));
  chk('hyst <= (Insel-Freiraum phi: setzen <= 0,45, loesen > 0,55): 0,6/0,45/0,5/0,55/0,56/0,44 -> aus, an, an, an, aus, an; NaN haelt',
    JSON.stringify(seqP)===JSON.stringify([false, true, true, true, false, true]) && G.hyst(true, NaN, 0.45, 0.55, '<=')===true && G.hyst(false, NaN, 0.5, 0.4)===false, seqP.join(','));
  const w0=G.gmGewicht(0, 3, 16), w1=G.gmGewicht(3, 3, 1), w2=G.gmGewicht(30, 3, 1), w3=G.gmGewicht(30, 3, 1e6);
  chk('gmGewicht = (mu c² / (r² + mu c²))²: r = 0 -> 1, r = c bei mu 1 -> 0,25, weit draussen klein, mu gross -> ~1',
    w0===1 && Math.abs(w1-0.25)<1e-15 && w2<1e-3 && w3>0.99, `${w1} / ${e(w2)} / ${w3.toFixed(5)}`);
}

// ------------------------------------------------- gBei (3.2.3)
{
  const g={psi:0.2, tx:1.0, ty:-0.03, tz:2.0};
  const d=[[0,0,0,0], [0.01, 0.05, 0.002, -0.04], [-0.02, 0.10, 0.004, 0.03]], tK=[100, 115, 130];
  const A={g, knoten:{t:Float64Array.from(tK), s:Float64Array.from([0, 3, 6]), d:Float64Array.from(d.flat()), cov:null}};
  const S={g, knoten:tK.map((t,j)=>({t, d:d[j]}))};
  const dv=v=>({psi:v[0], tx:v[1], ty:v[2], tz:v[3]}), mitte=(a,b,u)=>a.map((x,c)=>x+u*(b[c]-x));
  const gl=(x,y)=>Math.max(Math.abs(x.psi-y.psi), Math.abs(x.tx-y.tx), Math.abs(x.ty-y.ty), Math.abs(x.tz-y.tz));
  const ohne=G.gBei({g, knoten:null}, 120);
  chk('gBei ohne Knoten = g (neues Objekt, gleiche Werte)', ohne!==g && gl(ohne, g)===0);
  const an=[0,1,2].map(j=>gl(G.gBei(A, tK[j]), G.gKomp(g, dv(d[j]))));
  chk('gBei an Knoten j = gKomp(g, d_j) (bitgleich)', an.every(x=>x===0), an.map(e).join(' '));
  const zw=gl(G.gBei(A, 107.5), G.gKomp(g, dv(mitte(d[0], d[1], 0.5)))), zw2=gl(G.gBei(A, 126), G.gKomp(g, dv(mitte(d[1], d[2], 11/15))));
  chk('gBei zwischen Knoten: d linear in t', zw<1e-15 && zw2<1e-15, `${e(zw)} / ${e(zw2)}`);
  const au=Math.max(gl(G.gBei(A, 80), g), gl(G.gBei(A, 200), G.gKomp(g, dv(d[2]))));
  chk('gBei ausserhalb [t0, tK-1] konstant (vorn d_0 = 0 -> g, hinten d_K-1)', au===0, e(au));
  const beide=Math.max(...[80, 100, 103.7, 115, 129.99, 130, 300].map(t=>gl(G.gBei(A, t), G.gBei(S, t))));
  chk('gBei: Abschnitt (Float64Array) und KarteStand-Eintrag ([{t, d}]) gleich', beide===0, e(beide));
  const A2={g, knoten:{t:Float64Array.from([...tK, 145]), s:Float64Array.from([0, 3, 6, 9]), d:Float64Array.from(d.flat()), cov:null}};
  chk('gBei: von M4 angehaengter Knoten ohne d (M6 noch nicht gelaufen) gilt als d des vorigen', gl(G.gBei(A2, 140), G.gKomp(g, dv(d[2])))===0);
  chk('gBei: Abschnitt lokal (g = null) -> null', G.gBei({g:null, knoten:null}, 1)===null);
}

// ------------------------------------------------- LDL^T
// Muster aus R13 (slam/bench-loeser.mjs): Posen 4 DoF, Linien 3 DoF, Odometrie innerhalb der Abschnitte,
// Linienbeobachtungen (Kopf schwenkt, Abschnitte sehen Waende wieder). Unbekannte verschraenkt angeordnet
// (p0, l0, p1, l1, ...), damit beide Kandidaten echte Permutationen sind. Werte: Zufalls-Jacobis, J^T J + lam·I.
const r13=(nKF, nL, obsPerKF, nSeg, R, lam=1)=>{
  const bl=[]; for(let i=0;i<Math.max(nKF, nL);i++){ if(i<nKF) bl.push(['p', i]); if(i<nL) bl.push(['l', i]); }
  const off={p:new Int32Array(nKF), l:new Int32Array(nL)}, gruppen=[]; let n=0;
  for(const [t,k] of bl){ off[t][k]=n; const d=t==='p' ? 4 : 3; for(let q=0;q<d;q++) gruppen.push(t==='p' ? 0 : 1); n+=d; }
  const F=[], segLen=Math.ceil(nKF/nSeg);
  for(let i=0;i+1<nKF;i++) if(Math.floor(i/segLen)===Math.floor((i+1)/segLen)) F.push({v:[['p',i],['p',i+1]], r:4});
  for(let i=0;i<nKF;i++){ const seg=Math.floor(i/segLen), head=Math.floor(i*0.6+seg*17)%nL; for(let k=0;k<obsPerKF;k++) F.push({v:[['p',i],['l',(head+k)%nL]], r:2}); }
  const E=new Map(), add=(r,c,v)=>{ if(r>c){ const x=r; r=c; c=x; } const key=c*n+r; E.set(key, (E.get(key)||0)+v); };
  for(const f of F){ const idx=f.v.map(([t,k])=>{ const d=t==='p' ? 4 : 3, o=off[t][k]; return Array.from({length:d}, (_,q)=>o+q); }).flat();
    const J=idx.map(()=>Array.from({length:f.r}, ()=>R()-0.5));
    for(let a=0;a<idx.length;a++) for(let b=a;b<idx.length;b++){ let s=0; for(let r=0;r<f.r;r++) s+=J[a][r]*J[b][r]; if(idx[a]===idx[b] && a!==b) s*=2; add(idx[a], idx[b], s); } }
  for(let i=0;i<n;i++) add(i, i, lam);
  // Diagonalbloecke dicht wie in bench-loeser.mjs (auch fuer Linien ohne Beobachtung: strukturelle Nullen).
  for(const [t,k] of bl){ const d=t==='p' ? 4 : 3, o=off[t][k]; for(let q=0;q<d;q++) for(let q2=q+1;q2<d;q2++) add(o+q, o+q2, 0); }
  const keys=[...E.keys()].sort((x,y)=>x-y), Ap=new Int32Array(n+1), Ai=new Int32Array(keys.length), Ax=new Float64Array(keys.length);
  keys.forEach((k,p)=>{ const c=Math.floor(k/n), r=k%n; Ap[c+1]++; Ai[p]=r; Ax[p]=E.get(k); });
  for(let c=0;c<n;c++) Ap[c+1]+=Ap[c];
  return {n, Ap, Ai, Ax, gruppen:Int32Array.from(gruppen)};
};
const dicht=({n, Ap, Ai, Ax}, b)=>{ const A=new Float64Array(n*n);
  for(let c=0;c<n;c++) for(let p=Ap[c];p<Ap[c+1];p++){ A[Ai[p]*n+c]=Ax[p]; A[c*n+Ai[p]]=Ax[p]; }
  for(let j=0;j<n;j++){ let s=A[j*n+j]; for(let k=0;k<j;k++) s-=A[j*n+k]*A[j*n+k]; const d=Math.sqrt(s); A[j*n+j]=d;
    for(let i=j+1;i<n;i++){ let t=A[i*n+j]; for(let k=0;k<j;k++) t-=A[i*n+k]*A[j*n+k]; A[i*n+j]=t/d; } }
  const y=Float64Array.from(b); for(let i=0;i<n;i++){ let s=y[i]; for(let k=0;k<i;k++) s-=A[i*n+k]*y[k]; y[i]=s/A[i*n+i]; }
  for(let i=n-1;i>=0;i--){ let s=y[i]; for(let k=i+1;k<n;k++) s-=A[k*n+i]*y[k]; y[i]=s/A[i*n+i]; }
  return y; };
const loese=(M, perm, b)=>{ const S=G.ldlSymb(M.n, M.Ap, M.Ai, perm), F=G.ldlNum(S, M.Ax); return F ? G.ldlLoes(F, b, null) : null; };
const ordPerm=(M, name)=>{ const o=G.ldlOrdnung(M.n, M.Ap, M.Ai, M.gruppen, {kandidaten:[name]}); return o.perm; };
{
  const R=G.KG.rnd(13); let worst=0, nMin=1e9, nMax=0, fehl=0, anz=0;
  while(anz<100){ const ziel=50+Math.round(550*anz/99), nKF=Math.max(3, Math.round((0.1+0.6*R())*ziel/4)), nL=Math.max(3, Math.round((ziel-4*nKF)/3)), n=4*nKF+3*nL;
    if(n<50 || n>600) continue;
    const M=r13(nKF, nL, 2+Math.floor(R()*14), 1+Math.floor(R()*10), R), b=Float64Array.from({length:M.n}, ()=>R()-0.5), xd=dicht(M, b);
    const nx=Math.max(...xd.map(Math.abs));
    for(const perm of [null, ordPerm(M,'knotenZuerst'), ordPerm(M,'waendeZuerst')]){ const x=loese(M, perm, b); if(!x){ fehl++; continue; }
      worst=Math.max(worst, maxAbs(x, xd)/nx); }
    nMin=Math.min(nMin, M.n); nMax=Math.max(nMax, M.n); anz++; }
  chk('LDL^T gegen dichte Cholesky: 100 Zufallssysteme mit R13-Muster (n 50-600), je Einheit/knotenZuerst/waendeZuerst, |x - x_dicht| <= 1e-9·|x|',
    !fehl && worst<=1e-9, `n ${nMin}-${nMax}, schlechtester rel. Fehler ${e(worst)}, null ${fehl}`);
  // b und x duerfen dasselbe Feld sein.
  const M=r13(10, 12, 4, 2, R), b=Float64Array.from({length:M.n}, ()=>R()), xd=dicht(M, b), S=G.ldlSymb(M.n, M.Ap, M.Ai, ordPerm(M,'waendeZuerst')), F=G.ldlNum(S, M.Ax);
  const bb=Float64Array.from(b); G.ldlLoes(F, bb, bb);
  chk('ldlLoes(F, b, x) mit x = b (gleiches Feld) loest richtig', maxAbs(bb, xd)<1e-9*Math.max(...xd.map(Math.abs)));
}
{
  // singulaer bzw. indefinit -> null
  const csc=(n, dichtOben)=>{ const Ap=[0], Ai=[], Ax=[]; for(let c=0;c<n;c++){ for(let r=0;r<=c;r++){ const v=dichtOben[r][c]; if(v!==0 || r===c){ Ai.push(r); Ax.push(v); } } Ap.push(Ai.length); }
    return {n, Ap:Int32Array.from(Ap), Ai:Int32Array.from(Ai), Ax:Float64Array.from(Ax)}; };
  const nullOf=(M, perm=null)=>G.ldlNum(G.ldlSymb(M.n, M.Ap, M.Ai, perm), M.Ax)===null;
  const leer=csc(3, [[2,1,0],[1,2,0],[0,0,0]]);                         // Unbekannte ohne Faktor
  const lap=csc(5, Array.from({length:5}, (_,i)=>Array.from({length:5}, (_,j)=>i===j ? (i===0||i===4 ? 1 : 2) : (Math.abs(i-j)===1 ? -1 : 0))));   // Pfad-Laplace (Eichfreiheit)
  const ind=csc(2, [[1,2],[2,1]]);
  const R=G.KG.rnd(3), Jd=Array.from({length:12}, ()=>{ const r=Array.from({length:5}, ()=>R()-0.5); r[4]=r[1]; return r; });   // doppelte Spalte
  const dup=csc(5, Array.from({length:5}, (_,i)=>Array.from({length:5}, (_,j)=>Jd.reduce((s,r)=>s+r[i]*r[j], 0))));
  chk('ldlNum -> null bei singulaerem System (Unbekannte ohne Faktor, Pfad-Laplace, doppelte Spalte) und bei indefinitem; auch mit Permutation',
    nullOf(leer) && nullOf(lap) && nullOf(dup) && nullOf(ind) && nullOf(lap, Int32Array.from([4,2,0,3,1])) && nullOf(dup, Int32Array.from([4,3,2,1,0])) &&
    G.ldlNum(G.ldlSymb(2, ind.Ap, ind.Ai, null), Float64Array.from([2, 1, 2]))!==null);
}
{
  // Reihenfolge an den R13-Faellen: nnz(L) genau wie slam/bench-loeser.mjs, Wahl, Bitgleichheit, Zeit.
  const R=G.KG.rnd(1);
  const A=r13(40, 120, 15, 10, R), B=r13(400, 50, 8, 6, R);
  const nn=(M, name)=>G.ldlOrdnung(M.n, M.Ap, M.Ai, M.gruppen, {kandidaten:[name]}).nnzL;
  const oA=G.ldlOrdnung(A.n, A.Ap, A.Ai, A.gruppen), oB=G.ldlOrdnung(B.n, B.Ap, B.Ai, B.gruppen);
  const zA=[nn(A,'knotenZuerst'), nn(A,'waendeZuerst')], zB=[nn(B,'knotenZuerst'), nn(B,'waendeZuerst')];
  chk('ldlOrdnung: R13 "40 120 15 10" nnz(L) 19971 / 10136 -> waendeZuerst; "400 50 8 6" 152539 / 1175878 -> knotenZuerst',
    A.n===520 && B.n===1750 && zA[0]===19971 && zA[1]===10136 && zB[0]===152539 && zB[1]===1175878 && oA.name==='waendeZuerst' && oB.name==='knotenZuerst' && oA.nnzL===10136 && oB.nnzL===152539,
    `n ${A.n}: ${zA.join(' / ')} -> ${oA.name}; n ${B.n}: ${zB.join(' / ')} -> ${oB.name}`);
  const oA2=G.ldlOrdnung(A.n, A.Ap, A.Ai, A.gruppen), gleich=oA2.name===oA.name && oA2.nnzL===oA.nnzL && oA2.perm.every((v,i)=>v===oA.perm[i]);
  const b=Float64Array.from({length:A.n}, ()=>R()-0.5), x1=loese(A, oA.perm, b), x2=loese(A, oA2.perm, b);
  chk('ldlOrdnung und Loesung bei gleicher Eingabe bitgleich', gleich && x1.every((v,i)=>Object.is(v, x2[i])));
  const gleichstand=G.ldlOrdnung(A.n, A.Ap, A.Ai, A.gruppen, {kandidaten:['waendeZuerst', 'waendeZuerst']});
  chk('ldlOrdnung: Gleichstand -> erster Kandidat', gleichstand.name==='waendeZuerst');
  // Zeit n = 520 inkl. Ordnung und Symbolik (Aufbau der CSC ist Sache von M6 und hier nicht mitgezaehlt).
  const lauf=()=>{ const o=G.ldlOrdnung(A.n, A.Ap, A.Ai, A.gruppen), S=G.ldlSymb(A.n, A.Ap, A.Ai, o.perm), F=G.ldlNum(S, A.Ax); return G.ldlLoes(F, b, null); };
  for(let i=0;i<10;i++) lauf();
  const T=[], Tn=[], Ts=[]; for(let i=0;i<40;i++){ const t0=performance.now(); lauf(); T.push(performance.now()-t0); }
  const S=G.ldlSymb(A.n, A.Ap, A.Ai, oA.perm); for(let i=0;i<40;i++){ const t0=performance.now(); const F=G.ldlNum(S, A.Ax); G.ldlLoes(F, b, null); Tn.push(performance.now()-t0); }
  for(let i=0;i<40;i++){ const t0=performance.now(); G.ldlSymb(A.n, A.Ap, A.Ai, oA.perm); Ts.push(performance.now()-t0); }
  const med=a=>[...a].sort((x,y)=>x-y)[a.length>>1], p90=a=>[...a].sort((x,y)=>x-y)[Math.floor(0.9*a.length)];
  chk('Zeit n = 520 (R13-Muster): Ordnung + Symbolik + Numerik + Loesen <= 2 ms (Median von 40, Mac)', med(T)<=2,
    `Median ${med(T).toFixed(3)} ms, 90 % ${p90(T).toFixed(3)} ms; davon Numerik+Loesen ${med(Tn).toFixed(3)} ms, eine Symbolik ${med(Ts).toFixed(3)} ms`);
}

console.log(out.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
