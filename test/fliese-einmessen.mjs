// Prueft fliese-einmessen.html gegen synthetische Fliesen mit bekannter
// Wahrheit. Eine Abweichung hier liegt am Code, nicht am Massband.
import {readFileSync, existsSync} from 'node:fs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url),'utf8');
const html=read('fliese-einmessen.html');
const pick=(src,id)=>{
  const m=src.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`);
  return m[1];
};
new Function('"use strict";\n'+pick(html,'core')+'\n'+pick(html,'chevron'))();
const C=globalThis.CHEVRON;

const out=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const near=(a,b,tol)=>Number.isFinite(a) && Math.abs(a-b)<=tol;

// Der Kern ist eine Kopie - sie darf nicht still auseinanderlaufen.
const src=['raumaufmass.html','raumaufmass_opus.html'].find(f=>existsSync(new URL('../'+f, import.meta.url)));
chk(`core byte-gleich zu ${src}`, src && pick(read(src),'core')===pick(html,'core'));

// Strecken einer beliebigen Viereck-Wahrheit, als Feldtexte.
const dist=(P,a,b)=>Math.hypot(P[b].x-P[a].x, P[b].y-P[a].y);
// W: rechtwinklig von AB zur Ecke D.
const perp=P=>Math.abs((P.B.x-P.A.x)*(P.D.y-P.A.y)-(P.B.y-P.A.y)*(P.D.x-P.A.x))/dist(P,'A','B');
const fieldsOf=(P, perKey=()=>[0])=>Object.fromEntries(C.KEYS.map(k=>[k,
  perKey(k).map(e=>String((k==='W'?perp(P):dist(P,...C.PAIRS[k]))+e)).join(' ')]));
const para=(l,w,deg)=>C.corners({l, k:w/Math.tan(deg*Math.PI/180), w});

// 1. Exaktes Parallelogramm 850 x 150, 45 Grad.
{
  const r=C.measure(fieldsOf(para(850,150,45)), 0.5);
  chk('exakt: l', near(r.par?.l,850,1e-6), r.par?.l);
  chk('exakt: w', near(r.par?.w,150,1e-6), r.par?.w);
  chk('exakt: Winkel', near(r.par?.angle,45,1e-6), r.par?.angle);
  chk('exakt: A spitz', r.par && !r.par.obtuseAtA);
  chk('exakt: Viereck bestimmt, 1 Kontrolle', r.quad?.dof===0 && r.quad.redundancy===1);
  chk('exakt: W ohne Rest', near(r.par?.model.W,150,1e-6));
  chk('exakt: Viereck ohne Widerspruch', r.quad?.sigmaHat<1e-3, r.quad?.sigmaHat);
  chk('exakt: Eckwinkel 45/135/45/135', near(r.quad?.ang.A,45,1e-4) && near(r.quad?.ang.B,135,1e-4)
      && near(r.quad?.ang.C,45,1e-4) && near(r.quad?.ang.D,135,1e-4));
  chk('exakt: Breite an beiden Enden 150', near(r.quad?.widthD,150,1e-3) && near(r.quad?.widthC,150,1e-3));
  chk('exakt: Selbstcheck der Seite gruen', C.selfCheck().ok);
}

// 2. Andere Winkel - der Ausgleich darf nicht auf 45 Grad haengen.
for(const deg of [30, 60, 75, 90]){
  const r=C.measure(fieldsOf(para(600,100,deg)), 0.5);
  chk(`exakt ${deg} Grad`, near(r.par?.angle,deg,1e-6) && near(r.par?.w,100,1e-6) && near(r.par?.l,600,1e-6), r.par?.angle);
}

// 3. Beschriftung gespiegelt: A sitzt an einer stumpfen Ecke. Gleiche Fliese,
// gleiche Werte - nur der Hinweis kippt.
{
  const P=para(850,150,45), M={A:P.B, B:P.A, C:P.D, D:P.C};
  const r=C.measure(fieldsOf(M), 0.5);
  chk('gespiegelt: Winkel 45', near(r.par?.angle,45,1e-6), r.par?.angle);
  chk('gespiegelt: l und w', near(r.par?.l,850,1e-6) && near(r.par?.w,150,1e-6));
  chk('gespiegelt: als stumpf erkannt', r.par?.obtuseAtA===true);
}

// 4. Kein Parallelogramm: Ecke D 1 mm nach rechts, C 0,6 mm nach oben.
// Das Viereck muss genau diese Form zurueckgeben, das Parallelogramm muss
// sichtbar danebenliegen.
{
  const P=para(850,150,45); P.D={x:P.D.x+1, y:P.D.y}; P.C={x:P.C.x, y:P.C.y+0.6};
  const r=C.measure(fieldsOf(P), 0.5), q=r.quad;
  const angA=C.angleAt(P,'D','A','B'), angB=C.angleAt(P,'A','B','C');
  chk('schief: Viereck ohne Widerspruch', q?.dof===0 && q.sigmaHat<1e-3, q?.sigmaHat);
  chk('schief: Eckwinkel A', near(q?.ang.A,angA,1e-4), `${q?.ang.A} vs ${angA}`);
  chk('schief: Eckwinkel B', near(q?.ang.B,angB,1e-4), `${q?.ang.B} vs ${angB}`);
  chk('schief: Breite bei C 150,6', near(q?.widthC,150.6,1e-3), q?.widthC);
  chk('schief: Breite bei D 150', near(q?.widthD,150,1e-3), q?.widthD);
  chk('schief: lange Kanten 1 mm verschieden', near(q?.lens.AB-q?.lens.DC,1,1e-3));
  const maxPar=Math.max(...C.DIST_KEYS.map(k=>Math.abs(r.par.model[k]-dist(P,...C.PAIRS[k]))));
  chk('schief: Parallelogramm weicht sichtbar ab', maxPar>0.1, maxPar.toFixed(3)+' mm');
}

// 5. Wiederholungen mit Rauschen (sigma 0,5 mm, fester Seed): mehr Kontrolle,
// Ergebnis im Rahmen der angegebenen Standardabweichung.
{
  let s=12345;
  const rnd=()=>{ s=(s*1103515245+12345)%2147483648; return s/2147483648; };
  const gauss=()=>Math.sqrt(-2*Math.log(rnd()||1e-12))*Math.cos(2*Math.PI*rnd());
  const r=C.measure(fieldsOf(para(850,150,45), ()=>[0,0,0].map(()=>0.5*gauss())), 0.5);
  chk('Wiederholung: 21 Messungen, Viereck 13 Kontrollen', r.obs.length===21 && r.quad?.redundancy===13);
  chk('Wiederholung: Parallelogramm 18 Kontrollen', r.par?.redundancy===18);
  chk('Wiederholung: Streuung plausibel', r.quad?.sigmaHat>0.2 && r.quad.sigmaHat<0.9, r.quad?.sigmaHat?.toFixed(3));
  chk('Wiederholung: l innerhalb 3 sigma', Math.abs(r.par.l-850)<3*r.par.sd.l, `${r.par.l.toFixed(3)} ± ${r.par.sd.l.toFixed(3)}`);
  chk('Wiederholung: w innerhalb 3 sigma', Math.abs(r.par.w-150)<3*r.par.sd.w, `${r.par.w.toFixed(3)} ± ${r.par.sd.w.toFixed(3)}`);
  chk('Wiederholung: Winkel innerhalb 3 sigma', Math.abs(r.par.angle-45)<3*r.par.sd.angle, `${r.par.angle.toFixed(3)} ± ${r.par.sd.angle.toFixed(3)}`);
  chk('Wiederholung: Messungen passen zusammen', r.quad.maxW<=C.BAARDA_W0, r.quad.maxW.toFixed(2));
}

// 6. Grober Fehler: alles doppelt gemessen, eine AC-Messung 5 mm daneben.
// Mit Wiederholungen muss der Test genau diese Messung finden.
{
  const P=para(850,150,45);
  const r=C.measure(fieldsOf(P, k=>k==='AC' ? [0,5] : [0,0]), 0.5), q=r.quad;
  const bad=r.obs.findIndex(o=>o.key==='AC' && o.d>dist(P,'A','C')+1);
  const top=q.w.reduce((b,x,i)=>(x??-1)>(q.w[b]??-1)?i:b, 0);
  chk('Ausreisser: Widerspruch erkannt', q.maxW>C.BAARDA_W0, q.maxW.toFixed(2));
  chk('Ausreisser: richtige Messung gefunden', top===bad, `w max bei ${r.obs[top].key}#${top}`);
}

// 7. Was fehlt, wird gesagt - und nichts davon wird zu NaN.
{
  const f=fieldsOf(para(850,150,45));
  const noDiag=C.measure({...f, AC:'', BD:'', W:''}, 0.5);
  chk('ohne Diagonale: als fehlend gemeldet', noDiag.missing?.some(m=>m.includes('Diagonale')) && !noDiag.par);
  const four=C.measure({AB:f.AB, AD:f.AD, AC:f.AC, BD:f.BD}, 0.5);
  const wOnly=C.measure({AB:f.AB, AD:f.AD, W:f.W}, 0.5);
  chk('nur W statt Diagonale: 45 Grad', near(wOnly.par?.angle,45,1e-6) && wOnly.par.redundancy===0, wOnly.par?.angle);
  chk('4 Strecken: Parallelogramm bestimmt, 1 Kontrolle', near(four.par?.angle,45,1e-6) && four.par.redundancy===1);
  chk('4 Strecken: echte Form fehlt 1 Strecke', four.quad?.dof===1);
  const three=C.measure({AB:f.AB, AD:f.AD, BD:f.BD}, 0.5);
  chk('nur kurze Diagonale reicht fuers Parallelogramm', near(three.par?.angle,45,1e-6) && three.par.redundancy===0);
  const imp=C.measure({AB:'850', AD:'212', AC:'1200'}, 0.5);
  chk('unmoeglich: saubere Meldung', typeof imp.error==='string' && !imp.par, imp.error);
  const txt=C.measure({...f, BC:'21x'}, 0.5);
  chk('Tippfehler: Feld benannt', txt.bad?.includes('BC') && typeof txt.error==='string');
}

// 8. Eingabe: Komma, Leerzeichen, Semikolon.
{
  const p=C.parseValues('850,5 851;849.5  ');
  chk('Parser: drei Werte', JSON.stringify(p.vals)==='[850.5,851,849.5]' && !p.bad.length, JSON.stringify(p));
  chk('Parser: Null und Text sind ungueltig', C.parseValues('0 abc').bad.length===2);
}

console.log(out.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
