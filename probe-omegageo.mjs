// Stimmt die abgetastete Omega-Kehre mit der Herleitung ueberein?
// Prueft Stetigkeit, Endpunkt, Ausschwungweite und Kruemmung - unabhaengig
// vom Rest des Programms, an EINER konstruierten Kehre.
import { load } from './harness.mjs';
const api=load('verlegeplan.html'); const S=api.S;
const R=S.bendRadius, d=S.randSpacing;
const Pe={x:0,y:0}, u={x:1,y:0}, n={x:0,y:1}, Ps={x:0,y:d};
const pts=[{x:-500,y:0},Pe,...api.omegaTurn(Pe,Ps,u,R)];
const ops=api.pathCurve(pts,false).ops;
const dr=api.drawnPoints(pts,6);
const cosT=(d+2*R)/(4*R), th=Math.acos(cosT), sinT=Math.sin(th);
const reachSoll=R*(2*sinT+1);
let maxStep=0, maxU=-Infinity, minR=Infinity;
// Nur IM Bogenteil messen. Die 500-mm-Zulaufgerade wird als Bezier mit fester
// Stuetzenzahl abgetastet und liefert sonst 83 mm Schrittweite, die nichts
// ueber die Kehre aussagt.
for(let i=1;i<dr.length;i++) if(dr[i].x>1||dr[i-1].x>1)
  maxStep=Math.max(maxStep,Math.hypot(dr[i].x-dr[i-1].x,dr[i].y-dr[i-1].y));
for(const p of dr) maxU=Math.max(maxU,p.x);
const circum=(A,B,C)=>{ const a=Math.hypot(B.x-C.x,B.y-C.y),b=Math.hypot(A.x-C.x,A.y-C.y),
  c=Math.hypot(A.x-B.x,A.y-B.y);
  const ar=Math.abs((B.x-A.x)*(C.y-A.y)-(C.x-A.x)*(B.y-A.y))/2;
  return ar<1e-9?Infinity:a*b*c/(4*ar); };
// nur im Bogenteil messen, nicht auf der Zulaufgeraden
const st=dr.findIndex(p=>p.x>1);
for(let i=Math.max(st+1,1);i<dr.length-1;i++) minR=Math.min(minR,circum(dr[i-1],dr[i],dr[i+1]));
const end=dr[dr.length-1];
const ok=(name,v,soll,tol)=>console.log(
  `${Math.abs(v-soll)<=tol?'PASS':'FAIL'}  ${name.padEnd(28)} ist ${v.toFixed(1)}  soll ${soll.toFixed(1)} (+-${tol})`);
console.log(`theta = ${(th*180/Math.PI).toFixed(1)}°, d = ${d}, R = ${R}`);
ok('Endpunkt x',            end.x, Ps.x, 1);
ok('Endpunkt y',            end.y, Ps.y, 1);
ok('Ausschwungweite laengs',maxU,  reachSoll, 2);
ok('kleinster Radius',      minR,  R,     2);
console.log(`${maxStep<=12?'PASS':'FAIL'}  groesster Abtastschritt      ist ${maxStep.toFixed(1)} mm (soll <= 12)`);
console.log(`\nBoegen: ${ops.filter(o=>o.kind==='arc').length}, davon mit Mittelpunkt: ${ops.filter(o=>o.kind==='arc'&&o.c).length}`);
