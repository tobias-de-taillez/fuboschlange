// Prueft M4 raumskizze-abschnitte.js (ARCHITEKTUR v3, 17.3): Einbau; Schnitte, Klassen, sectionOf, Kette und Anker
// gegen F2 (A6-A8); stueckweise gleich wie auf einmal; Anker-Einordnung; Bindungen (Max-Mixture); Folgekanten; Sigma
// und Gewicht; Knoten; Registrierung auf T3 mit Platzhaltern fuer M5 (G.lmVorhersage: exakte Projektion der
// Wahrheitswaende in der Rueckgabeform von M5; lokale Karte: gesehene Wahrheitswaende im Bezug, verrauscht; eine Wand je
// Linie mit Ober- und Bodenkante wie M5) und M6 (g = gewaehlte Hypothese bzw. Kette); Hauptsatz 10.3 mit Pose-Korrekturen
// (A driftet bis zum Schnitt, B driftfrei), derselbe Hauptsatz und die Varianten noch einmal mit dem echten G.lmVorhersage
// aus raumskizze-landmarken.js, Gegenprobe mit frischen Samen. Laedt vendor + geo von raumskizze-probe.html wie
// raumskizze-protokoll.mjs und fuegt M0, M5 und M4 als eigene Bloecke vor globalThis.RAUMSKIZZE=G; ein, wenn die Seite
// sie nicht traegt.
//
//   node test/karte-abschnitte.mjs      (RAUMSKIZZE_HTML=pfad: anderer Stand; FIX=ordner: Fixtures F2; T3=0: ohne T3-Teil)
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {geoOhneKarte} from './karte-geo.mjs';
import {join} from 'node:path';
import * as T3 from '../raumskizze-sim.mjs';

const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
const DATEI='raumskizze-abschnitte.js', src=read(DATEI), mark='globalThis.RAUMSKIZZE=G;';
let geo=geoOhneKarte(pick('geo'));
const traegt=geo.includes('{\n'+src+'}\n') || geo.includes('{\n'+src+'\n}\n');
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G0keys=new Set(Object.keys(globalThis.RAUMSKIZZE));
for(const [name, test] of [['raumskizze-karte-grund.js', /G\.gBei=/], ['raumskizze-landmarken.js', /G\.lmVorhersage=/], [DATEI, /G\.sessionCuts=/]]){
  if(test.test(geo)) continue; const at=geo.lastIndexOf(mark); geo=geo.slice(0, at)+'{\n'+read(name)+'\n}\n'+geo.slice(at); }
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G=globalThis.RAUMSKIZZE;

const out=[], mess=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const notiz=s=>mess.push(s);
const D2R=Math.PI/180, R2D=180/Math.PI, H=T3.H_LASER, wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));
const f1=x=>Number.isFinite(x) ? x.toFixed(1) : String(x), f2=x=>Number.isFinite(x) ? x.toFixed(2) : String(x);
const e1=x=>Number.isFinite(x) ? x.toExponential(1) : String(x);
const SP='/private/tmp/claude-501/-Volumes-external-TobiCodetEndlichWieder-Zaene/86e1205e-9d6d-494b-b0b6-88f6e01be4b0/scratchpad';
const FIX=process.env.FIX || SP+'/karte/fixtures';
const zeit=f=>{ const t0=process.hrtime.bigint(), r=f(); return [r, Number(process.hrtime.bigint()-t0)/1e6]; };
const q=(a,p)=>{ if(!a.length) return NaN; const s=Float64Array.from(a).sort(); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
// 19.3 (Vertrag M4 -> M10, R2): dazu G.ketteNachF0
const NAMEN=['sessionCuts','schnittKlasse','sectionOf','ketteStart','registriere','ankerEinordnen','resKette','resAnker','abschnittSigma',
  'abschnittGewicht','knotenSetzen','resKnoten','ketteNachF0'];
const m4q=(p,[x,y,z,w])=>[1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
  2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  p[0], p[1], p[2], 1];
// Max-Mixture-Kosten je Komponente wie 3.2.1: ½chi² + ½ln|Σ| - ln w (w = 0: unendlich)
const mmKosten=(r,k)=>{ if(!(k.w>0)) return Infinity; let c=0, l=0; for(let i=0;i<4;i++){ c+=(r[i]/k.sigma[i])**2; l+=2*Math.log(k.sigma[i]); } return 0.5*c+0.5*l-Math.log(k.w); };
const chi2=(r,s)=>r.reduce((a,x,i)=>a+(x/s[i])**2, 0);

// ------------------------------------------------- Datei und Einbau
{
  const Gs={}; let fehler=null; try{ new Function('G', '"use strict";\n'+src)(Gs); }catch(x){ fehler=x.message; }
  const neu=Object.keys(Gs).sort(), soll=[...NAMEN].sort();
  chk('Datei laedt allein (new Function, ohne G-Zugriff beim Laden) und haengt genau die 13 Namen aus 4 und 19.3 an G', !fehler && JSON.stringify(neu)===JSON.stringify(soll),
    fehler || neu.filter(k=>!NAMEN.includes(k)).concat(NAMEN.filter(k=>!neu.includes(k))).join(',') || neu.length+' Namen');
  const koll=NAMEN.filter(k=>G0keys.has(k));
  chk('keine Kollision mit Namen, die der geo-Block schon traegt', !koll.length, koll.join(',') || (traegt ? 'Seite traegt das Modul' : 'eingefuegt'));
  chk('Datei endet mit genau einem Zeilenumbruch, kein import/export/</script>', /[^\n]\n$/.test(src) && !/^\s*(import|export)\s/m.test(src) && !src.includes('</script>'));
  const code=src.replace(/\/\/.*$/gm, '');
  const verboten=[/Math\.random/, /Date\.now/, /performance\.now/, /\bwindow\b/, /\bdocument\b/, /\bself\b/].filter(r=>r.test(code));
  chk('kein Math.random, keine Uhr, kein DOM/Worker-Global im Code (2)', !verboten.length, verboten.map(String).join(' '));
  chk('kein atan2 auf Matrixeintraege (Suchmuster aus test/karte-grund.mjs, 1.2)', !/atan2\s*\([^)]*\b(m|camTo|pose|T|M|mat)\s*\[\s*(0|2|8|10)\s*\]/.test(code));
}

// ------------------------------------------------- F2: Schnitte, Klassen, sectionOf, Kette, Anker (A6-A8)
const R9={6:{41.69:'reloc', 75.11:'reloc', 103.01:'reloc', 113.30:'nurT', 121.91:'reloc', 126.72:'nurT', 141.01:'nurT', 151.02:'reloc'},
          7:{9.37:'nurT', 20.89:'reloc', 58.52:'reloc', 86.23:'nurT', 105.79:'reloc'},
          8:{31.50:'reloc', 58.20:'reloc', 67.99:'nurT', 94.09:'nurT', 106.29:'nurT', 133.19:'nurT', 141.49:'nurT', 154.78:'nurT'}};
const ladeAnker=n=>{ const x=join(SP, 'a'+n, 'x'); if(!existsSync(x)) return null; const sub=readdirSync(x).find(d=>d.startsWith('aufnahme')); if(!sub) return null;
  const f=join(x, sub, 'anker.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)) : null; };
const F2={}, F2da=[6, 7, 8].every(n=>existsSync(join(FIX, `f2-a${n}.json`)));
if(!F2da) chk('Fixtures F2 vorhanden', false, FIX);
else {
  let nNurT=0, nReloc=0;
  for(const n of [6, 7, 8]){
    const F=JSON.parse(readFileSync(join(FIX, `f2-a${n}.json`), 'utf8')), AN=ladeAnker(n); F2[n]=F; F.AN=AN;
    const [S, ms]=zeit(()=>G.sessionCuts(F.posen, F.brueche, F.ereignisse, {anker:AN})); F.S=S;
    const W=F.schnitte, gleichS=(s,w)=>s.t===w.t && s.epA===w.epA && s.epB===w.epB && s.art===w.art && s.klasse===w.klasse && s.grund===w.grund && s.dt===w.dt &&
      Object.is(s.rPose, w.rPose) && Object.is(s.rPsi, w.rPsi) && s.dCam===w.dCam && s.bindung.art===w.bindung.art && s.bindung.sP===w.bindung.sP &&
      s.bindung.sY===w.bindung.sY && s.bindung.sH===w.bindung.sH && ['psi','tx','ty','tz'].every(k=>s.dT[k]===w.dT[k]) &&
      [0,1,2].every(j=>s.cb[j]===w.cb[j] && s.ca[j]===w.ca[j]) && s.pb[3]===w.pb[3] && s.pa[3]===w.pa[3];
    const i0=S.findIndex((s,i)=>!W[i] || !gleichS(s, W[i])), gleich=S.length===W.length && i0<0;
    chk(`F2 A${n}: ${S.length} Schnitte wie F2 (${W.length}); je Schnitt t, ep, art, klasse, grund, dt, rPose, rPsi, dCam, dT, cb/ca, Blicke, bindung bitgleich`, gleich,
      gleich ? `${ms.toFixed(1)} ms fuer ${F.posen.length} Posen` : `erster Unterschied #${i0}: ${S[i0] && S[i0].t} ${S[i0] && S[i0].art}/${S[i0] && S[i0].klasse} gegen ${W[i0] && W[i0].t} ${W[i0] && W[i0].art}/${W[i0] && W[i0].klasse}`);
    const tw=[]; for(let i=1;i<F.posen.length;i++){ const a=F.posen[i-1].T, b=F.posen[i].T; if([0,1,2,3].some(c=>a[c]!==b[c])) tw.push(F.posen[i].t); }
    const twS=tw.map(t=>S.find(s=>s.t===t));
    chk(`F2 A${n}: alle ${tw.length} T-Wechsel (R1: ${{6:8, 7:5, 8:8}[n]}) sind Schnitt mit art t-wechsel`, tw.length==={6:8, 7:5, 8:8}[n] && twS.every(s=>s && s.art==='t-wechsel'));
    const ist=twS.map(s=>[s.t, s.klasse]), passt=Object.entries(R9[n]).every(([t,k])=>{ const x=ist.find(([ts])=>Math.abs(ts-t)<0.02); return x && x[1]===k; });
    chk(`F2 A${n}: Klassen an den T-Wechseln wie R9`, passt, ist.map(([t,k])=>`${t.toFixed(2)} ${k}`).join(', '));
    nNurT+=ist.filter(x=>x[1]==='nurT').length; nReloc+=ist.filter(x=>x[1]==='reloc').length;
    let falsch=0; F.posen.forEach((p,i)=>{ const k=F.abschnitte.findIndex(a=>i>=a.iA && i<=a.iB); if(G.sectionOf(S, p.t, p.ep)!==k) falsch++; });
    chk(`F2 A${n}: sectionOf ordnet jede der ${F.posen.length} Zeilen ihrem Abschnitt zu (${F.abschnitte.length} Abschnitte)`, falsch===0 && S.length+1===F.abschnitte.length, `${falsch} falsch`);
    const ab=F.abschnitte.map(a=>({ab:a.ab, t0:a.t0, t1:a.t1, ep0:a.ep0, ep1:a.ep1, g0:null, g:null, knoten:null}));
    G.ketteStart(S, ab);
    const dG=Math.max(...ab.map((a,k)=>Math.max(...['psi','tx','ty','tz'].map(c=>Math.abs(a.g0[c]-F.abschnitte[k].g0[c])))));
    chk(`F2 A${n}: ketteStart g0 je Abschnitt wie F2 (<= 1e-12)`, dG<=1e-12, e1(dG));
    if(AN){ let dA=0, nA=0, gleichIds=true;
      S.forEach((s,i)=>{ const w=W[i].anker; if(s.anker.length!==w.length || s.anker.some((a,j)=>a.id!==w[j].id)) gleichIds=false;
        else s.anker.forEach((a,j)=>{ nA++; for(let c=0;c<4;c++) dA=Math.max(dA, Math.abs(a.pb[c]-w[j].pb[c]), Math.abs(a.pa[c]-w[j].pa[c])); }); });
      chk(`F2 A${n}: beidseits verfolgte Anker je Schnitt wie F2 (ids; Lage, Gier <= 1e-6, F2 rundet)`, gleichIds && dA<=1e-6, `${nA} Anker, max ${e1(dA)}`);
    } else chk(`F2 A${n}: anker.jsonl vorhanden`, false, SP+'/a'+n);
    // Bindungen am Startwert der Kette: Rest 0 (pose: gB = gA ∘ ΔT; kamera: Kamera und Blick stetig)
    let mr=0; S.forEach((s,i)=>{ const r=G.resKette(s, ab[i].g0, ab[i+1].g0).r; mr=Math.max(mr, ...r.map(Math.abs)); });
    chk(`F2 A${n}: resKette am Startwert der Kette = 0 fuer alle Schnitte (pose und kamera, <= 1e-12)`, mr<=1e-12, e1(mr));
  }
  chk('F2 A6-A8 zusammen: 11 nurT und 10 reloc an den 21 T-Wechseln (R9)', nNurT===11 && nReloc===10, `${nNurT} / ${nReloc}`);

  // stueckweise eingespeist (0,5 s): gleich wie auf einmal, gemeldete Schnitte bleiben dieselben Objekte, k bleibt
  for(const n of [6, 7, 8]){ const F=F2[n], P=F.posen, tEnd=P[P.length-1].t; let prev=null, ident=true, mono=true, kOk=true;
    for(let t=P[0].t+0.5;;t+=0.5){ const bis=Math.min(t, tEnd);
      const S=G.sessionCuts(P.filter(p=>p.t<=bis), F.brueche.filter(b=>b.t<=bis), F.ereignisse.filter(e=>e.t<=bis), {anker:F.AN && F.AN.filter(z=>z[0]<=bis+5)}, prev);
      if(prev){ if(prev.some(p=>!S.includes(p))) ident=false; if(S.length<prev.length) mono=false; }
      S.forEach((s,i)=>{ if(s.bindung.k==null) s.bindung.k='k'+i; else if(s.bindung.k!=='k'+i) kOk=false; });
      prev=S; if(bis>=tEnd) break; }
    const W=F.S, gleich=prev.length===W.length && prev.every((s,i)=>s.t===W[i].t && s.art===W[i].art && s.klasse===W[i].klasse && Object.is(s.rPose, W[i].rPose) &&
      s.bindung.sP===W[i].bindung.sP && s.dCam===W[i].dCam && s.anker.length===W[i].anker.length);
    chk(`F2 A${n}: stueckweise (0,5 s) eingespeist gleich wie auf einmal; gemeldete Schnitte bleiben Objekte, Zahl waechst nur, bindung.k bleibt`, gleich && ident && mono && kOk,
      `${prev.length} Schnitte`);
  }
  // Spaet eintreffendes Ereignis 'rest' (M10, Schritt 5a) in einem schon gemeldeten Abschnitt: neuer Schnitt dazwischen,
  // die uebrigen Schnitte bleiben dieselben Objekte (die Abschnitte dahinter verschieben sich um eins - Sache von M10)
  { const F=F2[7], P=F.posen, prev=G.sessionCuts(P, F.brueche, F.ereignisse, {anker:F.AN}), tR=P[1200].t;
    const S=G.sessionCuts(P, F.brueche, [...F.ereignisse, {t:tR, typ:'rest', rP:0.07, rPsi:0.004}], {anker:F.AN}, prev);
    const neu=S.filter(x=>!prev.includes(x));
    chk('sessionCuts: spaetes Ereignis rest teilt einen Abschnitt (art rest, reloc, rPose 7 cm), alle frueheren Schnitte bleiben Objekte', neu.length===1 && neu[0].art==='rest' &&
      neu[0].klasse==='reloc' && Math.abs(neu[0].rPose-0.07)<1e-12 && prev.every(p=>S.includes(p)) && S.length===prev.length+1, `${neu.length} neu bei ${neu[0] && neu[0].t} s`);
    const iR=S.indexOf(neu[0]), ab=[...S, null].map((_,k)=>({ab:k, g0:null, g:null, knoten:null})); ab[iR].g={psi:0.1, tx:0.2, ty:0.01, tz:-0.3};
    G.ketteStart(S, ab); const gR=ab[iR+1].g0, gA=G.gBei(ab[iR], neu[0].t);
    chk('ketteStart: hinter einem Schnitt rest gilt g0 = gBei(A, t) aus dem g des Vorgaengers (gleicher Bezug, 3.2.3)', ['psi','tx','ty','tz'].every(c=>gR[c]===gA[c]) && gR.psi===0.1,
      `Abschnitt ${iR+1}`); }
  // Anker-Einordnung an den F2-Schnitten (bezug 2.3: A6 115,99 s Anker 0,0 cm -> kamera; A8 129,61 s gemeinsam 1,44 m / 9,6° -> rahmen)
  const tab=[];
  for(const n of [6, 7, 8]) for(const s of F2[n].S){ const e=G.ankerEinordnen(s); tab.push(`A${n} ${s.t.toFixed(2)} ${s.art}/${s.klasse} ${s.anker.length}A -> ${e}`); s.einordnung=e; }
  const a6=F2[6].S.find(s=>Math.abs(s.t-115.987)<0.01), a8=F2[8].S.find(s=>Math.abs(s.t-129.686)<0.01);
  chk('ankerEinordnen: A6 115,99 s (Anker im Bezug 0,0 cm, Kamera 19,7 cm) -> kamera; A8 129,69 s (3 von 5 Ankern starr 9,6°) -> rahmen',
    a6 && a6.einordnung==='kamera' && a8 && a8.einordnung==='rahmen', `${a6 && a6.einordnung} / ${a8 && a8.einordnung}`);
  // knotenSetzen an F2 (Ersatz-Beob: Erfassungen, L = 0, da Zuordnung von M5 fehlt): zwei Laeufe gleich
  { const z=[]; let gleich=true;
    for(const n of [6, 7, 8]){ const F=F2[n], beob=F.erfassungen.map(e=>({t:e.t, ab:e.ab, art:'erfassung', L:0, schluessel:true, da:e.ra.d, db:e.rb.d}));
      const lauf=()=>F.abschnitte.map(a=>{ const X={ab:a.ab, t0:a.t0, t1:a.t1, ep0:a.ep0, ep1:a.ep1, stufe:'verbunden', knoten:null}; G.knotenSetzen(X, F.posen, beob); return X.knoten ? Array.from(X.knoten.t) : []; });
      const k1=lauf(), k2=lauf(); if(JSON.stringify(k1)!==JSON.stringify(k2)) gleich=false; z.push(`A${n} ${k1.reduce((s,x)=>s+Math.max(0, x.length), 0)}`); }
    chk('knotenSetzen an F2 (Erfassungen als Ersatz-Beob): zwei Laeufe gleich oft und gleich', gleich, 'Knoten gesamt '+z.join(', ')); }
  const zahl={}; for(const n of [6, 7, 8]) for(const s of F2[n].S) zahl[s.einordnung]=(zahl[s.einordnung]||0)+1;
  notiz(`[M] ankerEinordnen an den 47 F2-Schnitten: ${JSON.stringify(zahl)}`);
  notiz('    '+tab.join('\n    '));
}

// ------------------------------------------------- Einzeltests mit Zahlenbeispielen
// PoseZeilen: gerade Bahn mit 0,35 m/s, Gier-Rate 10°/s; Pose = T · camTo (1.1)
const zeilenBau=(n, o={})=>{ const Z=[]; let T=o.T || [0.3, 0.5, -1.2, 1.0], ep=0;
  for(let i=0;i<n;i++){ const t=i*0.1, a=0.2+0.17*t, p=[0.35*t+(i>=(o.sprungAb ?? 1e9) ? o.sprung || 0 : 0), 1.5, 0.1*t];
    if(o.tAb!=null && i===o.tAb){ T=[T[0]+(o.dT||[0,0,0,0])[0], T[1]+(o.dT||[0,0,0,0])[1], T[2]+(o.dT||[0,0,0,0])[2], T[3]+(o.dT||[0,0,0,0])[3]]; ep++; }
    if(o.epAb!=null && i===o.epAb) ep++;
    const qy=[0, Math.sin(a/2), 0, Math.cos(a/2)], P=m4q(p, qy), C=G.m4mul(G.m4inv(G.gMat(G.gAusT(T))), P);
    Z.push({t:+t.toFixed(6), ep, pose:[...p, ...qy], T:[...T], cam:[C[12], C[13], C[14]], blick:G.blickPlan(C), flags:0}); }
  return Z; };
{
  // schnittKlasse: Schwellen 2 cm / 1° / 0,5 s
  const Z=zeilenBau(10), z=i=>[Z[i-2], Z[i-1], Z[i]];
  const k0=G.schnittKlasse(z(5), 2, 't-wechsel');
  chk('schnittKlasse: stetige Bahn -> nurT, rPose < 1e-9, Bindung pose mit sigma 1 cm / 0,2° / 1 cm', k0.klasse==='nurT' && k0.rPose<1e-9 && k0.bindung.art==='pose' &&
    k0.bindung.sP===0.01 && Math.abs(k0.bindung.sY-0.2*D2R)<1e-15 && k0.bindung.sH===0.01, `rPose ${e1(k0.rPose)}, rPsi ${e1(k0.rPsi)}`);
  const versetzt=(dx,dpsi)=>{ const Y=z(5).map(x=>({...x})); const p=Y[2].pose; const a=2*Math.atan2(p[4], p[6])+dpsi; Y[2]={...Y[2], pose:[p[0]+dx, p[1], p[2], 0, Math.sin(a/2), 0, Math.cos(a/2)]}; return Y; };
  const k1=G.schnittKlasse(versetzt(0.019, 0), 2, 'bruch'), k2=G.schnittKlasse(versetzt(0.021, 0), 2, 'bruch'), k3=G.schnittKlasse(versetzt(0, 0.99*D2R), 2, 'bruch'), k4=G.schnittKlasse(versetzt(0, 1.01*D2R), 2, 'bruch');
  chk('schnittKlasse: Pose-Rest 1,9 cm nurT, 2,1 cm reloc; Gier-Rest 0,99° nurT, 1,01° reloc (Rest gegen konstante Geschwindigkeit, nicht roher Sprung)',
    k1.klasse==='nurT' && k2.klasse==='reloc' && k3.klasse==='nurT' && k4.klasse==='reloc', [k1, k2, k3, k4].map(k=>`${k.klasse} ${(100*k.rPose).toFixed(2)} cm/${(k.rPsi*R2D).toFixed(2)}°`).join(', '));
  const P=[Z[3], Z[4], {...Z[5], t:Z[4].t+0.6}], k5=G.schnittKlasse(P, 2, 'bruch');
  chk('schnittKlasse: dt 0,6 s -> pause, Bindung kamera sP = 0,03 + 0,7·dt, sY = (1 + 45·dt)°', k5.klasse==='pause' && k5.bindung.art==='kamera' &&
    Math.abs(k5.bindung.sP-(0.03+0.7*0.6))<1e-12 && Math.abs(k5.bindung.sY-(1+45*0.6)*D2R)<1e-12);
  const k6=G.schnittKlasse(z(5), 2, 'rest', {rest:{rP:[0.03, 0.04], rPsi:-0.01}});
  chk('schnittKlasse: art rest -> reloc mit rPose = |rP| = 5 cm, rPsi = |rPsi| (3.2.3)', k6.klasse==='reloc' && Math.abs(k6.rPose-0.05)<1e-12 && Math.abs(k6.rPsi-0.01)<1e-15 &&
    Math.abs(k6.bindung.sP-(0.03+0.7*0.1+0.025))<1e-9);
  const k7=G.schnittKlasse(z(5), 2, 'anker-zurueck');
  chk('schnittKlasse: art anker-zurueck -> zurueck, Bindung pose 2 cm / 0,3° / 1 cm, dG Einheit', k7.klasse==='zurueck' && k7.bindung.art==='pose' && k7.bindung.sP===0.02 &&
    Math.abs(k7.bindung.sY-0.3*D2R)<1e-15 && Object.values(k7.bindung.dG).every(v=>v===0));
  // ersteZeile ohne Vorgaenger: rPose NaN -> reloc (wie F2)
  const k8=G.schnittKlasse([undefined, Z[0], Z[1]], 2, 'bruch');
  chk('schnittKlasse: ohne zweite Vorzeile rPose = NaN -> reloc', Number.isNaN(k8.rPose) && k8.klasse==='reloc');
}
{
  // sessionCuts: Einschmelzen eines Kamerasprungs 0,2 s vor einem T-Wechsel, auch wenn der T-Wechsel spaeter eintrifft;
  // zwei Epochengrenzen nie zusammen; ref-reset und rest schneiden; gyro vorbereitet und aus
  const Z=zeilenBau(60, {sprungAb:20, sprung:0.25, tAb:22, dT:[0.01, 0.02, 0, 0]});
  const voll=G.sessionCuts(Z, [], []);
  let prev=null, verschwunden=false; for(let i=2;i<=60;i++){ const S=G.sessionCuts(Z.slice(0, i), [], [], {}, prev); if(prev && prev.some(p=>!S.includes(p))) verschwunden=true; prev=S; }
  chk('sessionCuts: Kamerasprung 0,2 s vor T-Wechsel -> ein Schnitt (art t-wechsel, Spanne bis nach dem Sprung, Klasse reloc); stueckweise gleich, kein Schnitt verschwindet',
    voll.length===1 && voll[0].art==='t-wechsel' && voll[0].klasse==='reloc' && voll[0].t===Z[22].t && prev.length===1 && prev[0].t===voll[0].t && !verschwunden,
    `${voll.length} Schnitt(e): ${voll.map(s=>s.t+' '+s.art+'/'+s.klasse).join(', ')}`);
  const Z2=zeilenBau(60, {tAb:20, dT:[0, 0.02, 0, 0], epAb:22});
  const S2=G.sessionCuts(Z2, [{t:Z2[22].t-0.01, grund:'pausiert'}], []);
  chk('sessionCuts: zwei Epochengrenzen 0,2 s auseinander werden nicht zusammengefasst', S2.length===2 && S2[0].art==='t-wechsel' && S2[1].art==='bruch', S2.map(s=>s.t+' '+s.art).join(', '));
  const Z3=zeilenBau(60), S3=G.sessionCuts(Z3, [], [{t:2.0, typ:'ref-reset'}, {t:4.0, type:'rest', rP:0.06, rPsi:0.002}]);
  chk('sessionCuts: Ereignisse ref-reset (art reset) und rest (art rest, reloc, rPose 6 cm) schneiden; typ und type', S3.length===2 && S3[0].art==='reset' && S3[0].t===2 &&
    S3[1].art==='rest' && S3[1].klasse==='reloc' && Math.abs(S3[1].rPose-0.06)<1e-12, S3.map(s=>s.t+' '+s.art+'/'+s.klasse).join(', '));
  const S4=G.sessionCuts(Z3, [], [{t:2.0, typ:'ref-reset'}, {t:4.0, typ:'rest', rP:0.06, rPsi:0}], {reset:false, rest:false});
  chk('sessionCuts: o.reset = false und o.rest = false schalten die Quellen ab', S4.length===0);
  // Drehung um +y um a ist Plan-Gier -a (1.2): imuPsi = -0,017 rad je Zeile
  const Zg=Z3.map((z,i)=>({...z, imuPsi:i ? -0.017 : undefined})), Sg0=G.sessionCuts(Zg, [], []), Sg1=G.sessionCuts(Zg, [], [], {gyro:true, gyroDeg:0.5});
  const Zg2=Zg.map((z,i)=>i===30 ? {...z, imuPsi:-0.017+3*D2R} : z), Sg2=G.sessionCuts(Zg2, [], [], {gyro:true, gyroDeg:2});
  chk('sessionCuts: gyro vorbereitet, Vorgabe aus; stimmt imuPsi mit der Pose (-0,17 rad/s Plan-Gier), kein Schnitt; 3° Abweichung bei gyroDeg 2 -> Schnitt gyro',
    Sg0.length===0 && Sg1.length===0 && Sg2.length===1 && Sg2[0].art==='gyro' && Sg2[0].t===Zg2[30].t, `${Sg0.length}/${Sg1.length}/${Sg2.length}`);
  const Sa=G.sessionCuts(Z3, [{t:3, grund:'anker-sprung', d:0.04, dpsiDeg:-0.4}, {t:3.5, grund:'anker-sprung', d:0.04, dpsiDeg:-0.6}], []);
  chk('sessionCuts: kleiner anker-sprung (< 5 cm und |Δψ| < 0,5°) schneidet nicht, mit |Δψ| 0,6° schon (Betrag)', Sa.length===1 && Sa[0].t===3.5, Sa.map(s=>s.t).join(','));
  // Kamerasprung bis merge s VOR bzw. NACH einem Bruch (Epoche +1, ohne T-Wechsel): ein Schnitt art bruch an der Epochengrenze
  // (3.2: zwischen der letzten Zeile von epA und der ersten von epB), Klasse ueber die ganze Spanne; sectionOf je Zeile wie
  // die Epoche; stueckweise eingespeist gleich. Der F2-Erzeuger (erzeuge-f2.mjs Z. 66) legte den Fall vor dem Bruch auf die
  // Sprungzeile (epA = epB); A6-A8 enthalten ihn nicht (F2 oben bitgleich).
  for(const [name, o, iBr, iSp] of [['Sprung 0,2 s vor dem Bruch', {sprungAb:20, sprung:0.25, epAb:22}, 22, 20], ['Sprung 0,2 s nach dem Bruch', {epAb:20, sprungAb:22, sprung:0.25}, 20, 22]]){
    const Z=zeilenBau(60, o), br=[{t:Z[iBr].t-0.01, grund:'pausiert'}], S=G.sessionCuts(Z, br, []), s=S[0];
    let prev=null, gleich=true; for(let i=2;i<=60;i++){ const T=G.sessionCuts(Z.slice(0, i), br.filter(b=>b.t<=Z[i-1].t), [], {}, prev); if(prev && prev.some(p=>!T.includes(p))) gleich=false; prev=T; }
    gleich=gleich && prev.length===1 && prev[0].t===s.t && prev[0].epA===s.epA && prev[0].epB===s.epB && prev[0].klasse===s.klasse;
    const falsch=Z.filter(z=>G.sectionOf(S, z.t, z.ep)!==z.ep).length;
    chk(`sessionCuts: ${name} -> ein Schnitt art bruch an der Epochengrenze (t, epA 0, epB 1), Klasse reloc ueber die Spanne mit Sprung; sectionOf = Epoche je Zeile; stueckweise gleich`,
      S.length===1 && s.art==='bruch' && s.t===Z[iBr].t && s.epA===0 && s.epB===1 && s.klasse==='reloc' && s.dt>=Math.abs(Z[iBr].t-Z[iSp].t)+0.1-1e-9 && falsch===0 && gleich,
      `${S.length} Schnitt(e): ${S.map(x=>`${x.t} ${x.art}/${x.klasse} ep ${x.epA}->${x.epB} dt ${f2(x.dt)}`).join(', ')}; ${falsch} Zeilen falsch`); }
}
{
  // sectionOf: Epoche entscheidet an Epochenschnitten, t nur innerhalb einer Epoche
  const S=[{t:5, epA:0, epB:1}, {t:7, epA:1, epB:1}, {t:9, epA:1, epB:2}];
  const f=[[4.9,0], [5.0,1], [6.99,1], [7.0,1], [8.0,1], [8.99,2], [9.5,2], [5.5,0]].map(([t,ep])=>G.sectionOf(S, t, ep));
  chk('sectionOf: Epoche vor t; Zeitschnitt innerhalb der Epoche nach t', JSON.stringify(f)===JSON.stringify([0, 1, 1, 2, 2, 3, 3, 0]), JSON.stringify(f));
  // ketteStart mit weniger Schnitten als Abschnitten - 1 (Zwischenstand): kein Fehler, g0 der Abschnitte ohne Schnitt null
  let fehler=null, ab=null; try{ ab=G.ketteStart([], [{ab:0, g0:null, g:null}, {ab:1, g0:null, g:null}]); }catch(x){ fehler=x.message; }
  chk('ketteStart: fehlt der Schnitt vor einem Abschnitt -> kein Fehler, g0 = null (Abschnitt 0 Einheit)', !fehler && ab[1].g0===null && ab[0].g0.psi===0, fehler || 'ok');
}
{
  // resKette: pose an der Kamera ausgewertet, kamera-Bindung, Max-Mixture-Umschlag bei chi²_stetig - chi²_sprung = 16
  const Z=zeilenBau(30, {tAb:15, dT:[0.05, 0.03, 0.01, -0.02]}), S=G.sessionCuts(Z, [], []), s=S[0];
  const gA={psi:0.3, tx:1, ty:0.05, tz:-2}, gB=G.gKomp(gA, s.bindung.dG), r0=G.resKette(s, gA, gB).r;
  const dP=[0.02, -0.01], gB2={...gB, tx:gB.tx+dP[0], tz:gB.tz+dP[1], ty:gB.ty+0.004}, r1=G.resKette(s, gA, gB2).r;
  chk('resKette pose: gB = gA ∘ ΔT -> r = 0; Verschiebung von gB um (2, -1) cm und 0,4 cm -> r = (2, -1, 0, 0,4) cm', s.klasse==='nurT' && Math.max(...r0.map(Math.abs))<1e-12 &&
    Math.abs(r1[0]-0.02)<1e-12 && Math.abs(r1[1]+0.01)<1e-12 && Math.abs(r1[2])<1e-12 && Math.abs(r1[3]-0.004)<1e-12, r1.map(x=>x.toFixed(4)).join(', '));
  // Drehung von gB um den Ursprung des Bezugs: Lage-Rest = Hebel an der Kamera ca, nicht tx/tz
  const d=0.01, gB3={...gB, psi:gB.psi+d}, r3=G.resKette(s, gA, gB3).r, c=[s.ca[0], s.ca[2]], p1=G.gPlan(gB3, c), p0=G.gPlan(gB, c);
  chk('resKette pose: Gier-Aenderung von gB ergibt den Lage-Rest an der Kamera ca (Hebel), r_psi = 0,01', Math.abs(r3[0]-(p1[0]-p0[0]))<1e-12 && Math.abs(r3[1]-(p1[1]-p0[1]))<1e-12 &&
    Math.abs(r3[2]-d)<1e-12, `|r_P| ${(100*Math.hypot(r3[0], r3[1])).toFixed(2)} cm bei |ca| ${f2(Math.hypot(...c))} m`);
  const Zk=zeilenBau(30, {sprungAb:15, sprung:0.3}), sk=G.sessionCuts(Zk, [], [])[0], gk=G.gKomp(gA, {psi:0.1, tx:0.2, ty:0.01, tz:-0.3});
  const gkB=(()=>{ const psi=gk.psi+sk.pb[3]-sk.pa[3], w=G.gAnw(gk, sk.cb), cs=Math.cos(psi), sn=Math.sin(psi); return {psi, tx:w[0]-(cs*sk.ca[0]-sn*sk.ca[2]), ty:w[1]-sk.ca[1], tz:w[2]-(sn*sk.ca[0]+cs*sk.ca[2])}; })();
  const rk=G.resKette(sk, gk, gkB).r, rk2=G.resKette(sk, gk, {...gkB, ty:gkB.ty+0.05}).r;
  chk('resKette kamera: Kamera und Blick in F0 stetig -> r = 0; Hoehe +5 cm -> r_y = 0,05', sk.bindung.art==='kamera' && Math.max(...rk.map(Math.abs))<1e-12 && Math.abs(rk2[3]-0.05)<1e-12);
  const R=G.resKette(s, gA, gB), st=R.komp.find(k=>k.name==='stetig'), sp=R.komp.find(k=>k.name==='sprung'), an=R.komp.find(k=>k.name==='anker');
  chk('resKette: kern mm, Komponenten stetig (w 1, sigma der Klasse), sprung (1 m / 20° / 0,3 m), anker (w 0)', R.kern==='mm' && st.w===1 && st.sigma[0]===s.bindung.sP &&
    sp.sigma[0]===1 && Math.abs(sp.sigma[2]-20*D2R)<1e-15 && sp.sigma[3]===0.3 && an.w===0);
  // Umschlag: r = λ·u (u = sigma_stetig je Achse, gleich gewichtet); Kosten stetig = sprung genau bei chi²_s - chi²_j = 16
  const u=st.sigma.map(x=>x/2), kost=lam=>{ const r=u.map(x=>lam*x); return [mmKosten(r, st), mmKosten(r, sp), chi2(r, st.sigma)-chi2(r, sp.sigma), chi2(r, st.sigma)]; };
  let lo=0, hi=100; for(let it=0;it<200;it++){ const m=(lo+hi)/2, [a, b]=kost(m); if(a<b) lo=m; else hi=m; }
  const [, , dchi, chiS]=kost(lo);
  chk('Max-Mixture: sprung gewinnt genau ab chi²_stetig - chi²_sprung = 16 (MM.schwelle, Gewicht je Schnitt aus |Σ|)', Math.abs(dchi-16)<1e-6, `chi²_stetig am Umschlag ${f2(chiS)}`);
}
{
  // resAnker: Anker in F0 stetig -> 0
  const s={anker:[{id:1, pb:[1, 0, 2, 0.1], pa:[0.5, 0.02, 2.3, 0.2]}, {id:2, pb:[-1, 0, 0, 0], pa:[-1.2, 0.02, 0.4, 0.1]}]};
  const gA={psi:0.2, tx:0.1, ty:0, tz:0.3}, gB=G.gKomp(gA, G.gInv({psi:0.1, tx:-0.3, ty:0.02, tz:0.2}));
  s.anker[0].pa=[...G.gAnw({psi:0.1, tx:-0.3, ty:0.02, tz:0.2}, [1, 0, 2]), 0.2];
  s.anker[1].pa=[...G.gAnw({psi:0.1, tx:-0.3, ty:0.02, tz:0.2}, [-1, 0, 0]), 0.1];
  const r=G.resAnker(s, gA, gB);
  chk('resAnker: Anker starr mit dem Bezug versetzt, gB passend -> r = 0; sigma 5 cm / 1° / 2 cm je Anker', r.r.length===8 && Math.max(...r.r.map(Math.abs))<1e-12 &&
    r.sigma[0]===0.05 && Math.abs(r.sigma[2]-D2R)<1e-15 && r.sigma[3]===0.02, e1(Math.max(...r.r.map(Math.abs))));
  const ke={anker:s.anker, dCam:0.3, rPose:0.3};
  chk('ankerEinordnen: zwei Anker starr bewegt -> rahmen; einer abweichend -> unbekannt; keine Anker -> unbekannt; zurueckZu -> zurueck',
    G.ankerEinordnen(ke)==='rahmen' && G.ankerEinordnen({...ke, anker:[s.anker[0], {...s.anker[1], pa:[...s.anker[1].pa.slice(0, 3).map((x,i)=>i===0 ? x+0.1 : x), 0.1]}]})==='unbekannt' &&
    G.ankerEinordnen({anker:[]})==='unbekannt' && G.ankerEinordnen({anker:[], zurueckZu:3})==='zurueck');
}
{
  // resKnoten: Drehung um den Ursprung bei c != 0 -> r_P = d_{j+1}(c) - d_j(c); sigma nach G.KG.KNOTEN
  const A={knoten:{t:Float64Array.from([0, 15]), s:Float64Array.from([0, 3.5]), c:Float64Array.from([1, 1, 3, 2]), d:new Float64Array(0), cov:null}};
  const d0=[0.1, 0.2, 0.01, -0.1], d1=[0.12, 0.25, 0.015, -0.05], c=[3, 2], ev=d=>[Math.cos(d[0])*c[0]-Math.sin(d[0])*c[1]+d[1], Math.sin(d[0])*c[0]+Math.cos(d[0])*c[1]+d[3]];
  const R=G.resKnoten(A, 0, d0, d1), e0=ev(d0), e2=ev(d1), K=G.KG.KNOTEN;
  chk('resKnoten: r_P = d_{j+1}(c) - d_j(c) an der Kamera des Knotens j+1 (nicht Δtx/Δtz), r_psi, r_y; kein Robustkern', Math.abs(R.r[0]-(e2[0]-e0[0]))<1e-12 && Math.abs(R.r[1]-(e2[1]-e0[1]))<1e-12 &&
    Math.abs(R.r[2]-0.02)<1e-12 && Math.abs(R.r[3]-0.005)<1e-12 && Math.abs(R.r[0]-0.05)>0.01, `r_P ${R.r.slice(0, 2).map(x=>x.toFixed(4)).join(', ')} gegen Δt ${(0.05).toFixed(4)}, ${(0.05).toFixed(4)}`);
  chk('resKnoten: sigma Lage √(0,5² + (1,0·3,5)²) cm, Gier √(0,05² + (0,1·3,5)²)°, Hoehe √(0,2² + (0,2·3,5)²) cm', Math.abs(R.sigma[0]-Math.hypot(K.sP0, K.kP*3.5))<1e-15 &&
    Math.abs(R.sigma[2]-Math.hypot(K.sY0Deg, K.kYDeg*3.5)*D2R)<1e-15 && Math.abs(R.sigma[3]-Math.hypot(K.sH0, K.kH*3.5))<1e-15, R.sigma.map(x=>x.toExponential(2)).join(', '));
  const Ro=G.resKnoten(A, 0, {psi:d0[0], tx:d0[1], ty:d0[2], tz:d0[3]}, {psi:d1[0], tx:d1[1], ty:d1[2], tz:d1[3]});
  chk('resKnoten: d als Feld oder als {psi, tx, ty, tz}', Ro.r.every((x,i)=>x===R.r[i]));
}
{
  // abschnittSigma / abschnittGewicht
  const cov=new Float64Array(16), set=(i,j,v)=>{ cov[4*i+j]=v; cov[4*j+i]=v; };
  set(0,0,(0.5*D2R)**2); set(1,1,0.04**2); set(3,3,0.02**2); set(1,3,0.5*0.04*0.02); set(2,2,0.01**2);
  const s=G.abschnittSigma(cov), a=0.04**2, d=0.02**2, b=0.5*0.04*0.02, m=(a+d)/2, w=Math.sqrt(((a-d)/2)**2+b*b);
  chk('abschnittSigma: psi, Halbachsen der Lage (Eigenwerte tx/tz), Richtung, y', Math.abs(s.psi-0.5*D2R)<1e-15 && Math.abs(s.max-Math.sqrt(m+w))<1e-15 && Math.abs(s.min-Math.sqrt(m-w))<1e-15 &&
    Math.abs(s.y-0.01)<1e-15 && Math.abs(s.ang-0.5*Math.atan2(2*b, a-d))<1e-15, `max ${(100*s.max).toFixed(2)} cm, min ${(100*s.min).toFixed(2)} cm, ang ${(s.ang*R2D).toFixed(1)}°`);
  const K=new Float64Array(48); K.set(cov, 0); const c2=cov.map(x=>4*x); K.set(c2, 16); K.set(cov, 32);
  const sk=G.abschnittSigma(K);
  chk('abschnittSigma: mit Knoten-Kovarianzen der schlechteste Knoten (3.2.2)', Math.abs(sk.max-2*s.max)<1e-15 && Math.abs(sk.psi-2*s.psi)<1e-15);
  // Hebel: Lage an c = (3, 0) mit psi 0: Var_z = Var_tz + 9·Var_psi (+ Kovarianz 0)
  const c0=new Float64Array(16); c0[0]=(1*D2R)**2; c0[5]=1e-6; c0[15]=1e-6; c0[10]=1e-6;
  const sc=G.abschnittSigma(c0, {c:[3, 0], psi:0});
  chk('abschnittSigma(cov, {c, psi}): Hebel der Gier am Punkt (3 m, 1° -> 5,2 cm)', Math.abs(sc.max-Math.sqrt(1e-6+9*(D2R)**2))<1e-12, `${(100*sc.max).toFixed(2)} cm`);
  const g=x=>G.abschnittGewicht({stufe:'verbunden', sig:{max:x}});
  chk('abschnittGewicht: exp(-max²/(2·0,05²)) fuer verbunden/locker, 0 fuer lokal/lose oder ohne sig', Math.abs(g(0.05)-Math.exp(-0.5))<1e-15 && g(0)===1 &&
    G.abschnittGewicht({stufe:'locker', sig:{max:0.1}})===Math.exp(-2) && G.abschnittGewicht({stufe:'lose', sig:{max:0}})===0 && G.abschnittGewicht({stufe:'lokal', sig:{max:0}})===0 &&
    G.abschnittGewicht({stufe:'verbunden', sig:null})===0);
  chk('abschnittSigma(null) = null', G.abschnittSigma(null)===null);
}

// ------------------------------------------------- T3: Platzhalter M5 und Lauf
// G.lmVorhersage aus der Wahrheit in der Rueckgabeform von M5 (lmVorhersage/kantenVon, Wandmodell in G.registriere 3.):
// Oberkante bei hC (Zahl: eigene Hoehe, 'lokal': hLokal.h) als A/B/iv mit sichtbar, Bodenkante bei hF als unten {A, B, iv}
// (null bei Stoerern), auch wenn die Oberkante nicht sichtbar ist. Strecken je Intervall aus iv und boden ({s0, s1}), A/B
// ueber die ganze Spanne; mit g (Kandidat) oder G.gBei; Nahebene 5 cm, Schnitt mit dem Bildrand, Pixel wie G.ndcToPix.
// Keine Verdeckung (wie eine Vorhersage aus der Karte).
const ivListe=W=>[...(W.iv||[]), ...(W.boden||[])].map(x=>Array.isArray(x) ? x : [x.s0, x.s1]).sort((a,b)=>a[0]-b[0]);
const lmEcht=G.lmVorhersage;
let nVorhersagen=0;
const lmPlatzhalter=(W,kam,karte,g)=>{
  nVorhersagen++;
  const aus={A:null, B:null, sigPx:Infinity, sichtbar:false, iv:[], unten:null}, gg=g || G.gBei(karte.abschnitte[kam.ab], kam.t), L=ivListe(W); if(!gg || !L.length) return aus;
  const V=G.m4inv(G.m4mul(G.gMat(gg), Array.from(kam.camTo))), n=G.wandN(W.phi), u=G.wandU(W.phi), NZ=-0.05;
  const strecke=(y,s0,s1)=>{ let a=G.m4vec(V, [n[0]*W.rho+u[0]*s0, y, n[1]*W.rho+u[1]*s0, 1]), b=G.m4vec(V, [n[0]*W.rho+u[0]*s1, y, n[1]*W.rho+u[1]*s1, 1]);
    if(a[2]>NZ && b[2]>NZ) return null;
    const lerp=(p,q,t)=>p.map((x,i)=>x+t*(q[i]-x));
    if(a[2]>NZ) a=lerp(a, b, (NZ-a[2])/(b[2]-a[2])); else if(b[2]>NZ) b=lerp(b, a, (NZ-b[2])/(a[2]-b[2]));
    const P=kam.proj, pa=G.m4vec(P, a), pb=G.m4vec(P, b), A=[pa[0]/pa[3], pa[1]/pa[3]], B=[pb[0]/pb[3], pb[1]/pb[3]];
    let t0=0, t1=1; const dx=B[0]-A[0], dy=B[1]-A[1];
    for(const [p, qq] of [[-dx, A[0]+1], [dx, 1-A[0]], [-dy, A[1]+1], [dy, 1-A[1]]]){ if(p===0){ if(qq<0) return null; continue; } const r=qq/p; if(p<0) t0=Math.max(t0, r); else t1=Math.min(t1, r); }
    if(t0>=t1) return null;
    const pix=t=>G.ndcToPix(A[0]+t*dx, A[1]+t*dy, kam.w, kam.h, kam.flipY); return [pix(t0), pix(t1)]; };
  const kante=y=>{ const ab=strecke(y, Math.min(...L.map(x=>x[0])), Math.max(...L.map(x=>x[1]))); if(!ab) return null;
    return {A:ab[0], B:ab[1], sigPx:1, iv:L.map(([s0, s1])=>strecke(y, s0, s1)).filter(Boolean)}; };
  const stoer=typeof W.h==='number', t=kante(stoer ? W.h : W.h==='lokal' && W.hLokal ? W.hLokal.h : karte.hC), o=stoer ? null : kante(karte.hF ?? 0);
  return t ? {A:t.A, B:t.B, sigPx:1, sichtbar:true, iv:t.iv, unten:o} : {...aus, unten:o};
};
G.lmVorhersage=lmPlatzhalter;
// Sitzung -> Schnitte, Abschnitte, Bilder, Beob (eine je Segment O/U), Schluesselbilder 10 cm / 5°
function t3Aufbereiten(e){
  const S=G.sessionCuts(e.posen, e.breaks, e.ereignisse), nA=S.length+1, KG=G.KG;
  const ab=Array.from({length:nA}, (_,k)=>({ab:k, t0:Infinity, t1:-Infinity, ep0:Infinity, ep1:-Infinity, g0:null, g:null, cov:null, knoten:null, hLok:null, sig:null, reg:null, stufe:'lokal', bilder:[]}));
  for(const p of e.posen){ const k=G.sectionOf(S, p.t, p.ep), A=ab[k]; A.t0=Math.min(A.t0, p.t); A.t1=Math.max(A.t1, p.t); A.ep0=Math.min(A.ep0, p.ep); A.ep1=Math.max(A.ep1, p.ep); }
  const bilder=new Map(), beob=[], letzte=new Map();
  for(const x of e.bilder){ const B=x.bildErg, k=G.sectionOf(S, B.t, B.ep), c=B.camTo, l=letzte.get(k), bl=G.blickPlan(c);
    const sch=!l || Math.hypot(c[12]-l.c[0], c[14]-l.c[1])>=0.10 || Math.abs(wrap(bl-l.b))>=5*D2R; if(sch) letzte.set(k, {c:[c[12], c[14]], b:bl});
    bilder.set(B.k, {t:B.t, ab:k, ep:B.ep, c:[c[12], c[13], c[14]], camTo:c, f:B.f, schluessel:sch, proj:B.proj, w:B.w, h:B.h, flipY:B.flipY});
    ab[k].bilder.push(x);
    for(let j=0;j<B.n;j++){ const cl=B.cls[j]; if(cl!==KG.KL.O && cl!==KG.KL.U) continue;
      beob.push({id:beob.length, k:B.k, t:B.t, ab:k, ep:B.ep, i:j, art:cl===KG.KL.O ? 'decke' : 'boden', L:-1, c:[c[12], c[13], c[14]],
        da:Array.from(B.dir.subarray(6*j, 6*j+3)), db:Array.from(B.dir.subarray(6*j+3, 6*j+6)), sPx:B.seg[10*j+5], f:B.f, len:B.seg[10*j+9], nSeg:1, schluessel:sch, nutzer:false,
        wand:x.wahr.wand[j], kante:x.wahr.kante[j]}); } }
  return {S, ab, bilder, beob};
}
// Gesehene Wahrheitswaende eines Abschnitts: je (Wand, Kante 0/1) das Intervall laengs u aus den Strahlen der Segmente,
// gehoben auf Decke (H) bzw. Boden (0) in F0 mit dem wahren g des Bilds.
function gesehen(WT, A){ const m=new Map();
  for(const x of A.bilder){ const B=x.bildErg, g=x.wahr.g;
    for(let j=0;j<B.n;j++){ const wd=x.wahr.wand[j], ka=x.wahr.kante[j]; if(wd<0 || ka>1) continue; const W=WT.waende[wd], yT=ka===0 ? H : 0, key=wd+':'+ka;
      const c=G.gAnw(g, [B.camTo[12], B.camTo[13], B.camTo[14]]), cs=Math.cos(g.psi), sn=Math.sin(g.psi);
      for(const o of [0, 3]){ const d=B.dir.subarray(6*j+o, 6*j+o+3), dx=cs*d[0]-sn*d[2], dz=sn*d[0]+cs*d[2], lam=(yT-c[1])/d[1]; if(!(lam>0)) continue;
        const s=W.u[0]*(c[0]+lam*dx)+W.u[1]*(c[2]+lam*dz); let v=m.get(key); if(!v) m.set(key, v={wd, ka, s0:s, s1:s, n:0}); v.s0=Math.min(v.s0, s); v.s1=Math.max(v.s1, s); v.n++; } } }
  return [...m.values()].filter(v=>v.n>=10 && v.s1-v.s0>=0.1); }
// KarteZustand fuer die Registrierung von Abschnitt k: globale Karte = gesehene Wahrheitswaende der verbundenen Abschnitte
// (Orakel-Landmarken, Intervalle wie gesehen); lokale Karte = gesehene Wahrheitswaende im Bezug B_k (wahres g, verrauscht
// sigma 1 cm / 0,2°); hLok = H - ty_wahr + N(0, 1 cm). Wandmodell wie M5: eine Wand je Wahrheitslinie, h 'c', Intervalle
// der Deckenkante in iv, die der Bodenkante in boden, je {s0, s1, n} (3.3).
const linienVon=M=>{ const L=new Map(); for(const v of M.values()){ let x=L.get(v.wd); if(!x) L.set(v.wd, x={wd:v.wd, iv:[], boden:[]}); (v.ka===0 ? x.iv : x.boden).push({s0:v.s0, s1:v.s1, n:v.n}); }
  return [...L.values()].sort((a,b)=>a.wd-b.wd); };
const sammle=(M,v)=>{ const key=v.wd+':'+v.ka, x=M.get(key); if(!x) M.set(key, {...v}); else { x.s0=Math.min(x.s0, v.s0); x.s1=Math.max(x.s1, v.s1); x.n+=v.n; } };
function karteFuer(WT, Z, k, rnd, st={rho:0.01, phiDeg:0.2, h:0.01, lokal:true}){
  const gauss=()=>{ let u=0; while(!u) u=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd()); };
  const waende=new Map(), glob=new Map();
  for(const A of Z.ab) if(A.stufe==='verbunden') for(const v of gesehen(WT, A)) sammle(glob, v);
  for(const x of linienVon(glob)){ const W=WT.waende[x.wd]; waende.set('g'+x.wd, {id:'g'+x.wd, rahmen:-1, phi:W.phi, rho:W.rho, h:'c', iv:x.iv, boden:x.boden, cls:'wand', zustand:'bestaetigt',
    insel:W.insel ? 'ja' : 'nein'}); }
  const A=Z.ab[k], gw=A.bilder.length ? A.bilder[A.bilder.length>>1].wahr.g : null, lok=new Map();
  if(gw && st.lokal){ for(const v of gesehen(WT, A)) sammle(lok, v);
    for(const x of linienVon(lok)){ const W=WT.waende[x.wd], L=G.zuBezug({waende:[{phi:W.phi, rho:W.rho, iv:x.iv, boden:x.boden}]}, gw).waende[0];
      waende.set('l'+x.wd, {id:'l'+x.wd, rahmen:k, phi:((L.phi+st.phiDeg*D2R*gauss())%(2*Math.PI)+2*Math.PI)%(2*Math.PI), rho:L.rho+st.rho*gauss(), h:'c', iv:L.iv, boden:L.boden,
        cls:'wand', zustand:'bestaetigt'}); } }
  A.hLok=gw ? {hC:H-gw.ty+st.h*gauss(), sHC:Math.max(0.01, st.h)} : null;
  return {abschnitte:Z.ab, schnitte:Z.S, waende, bilder:Z.bilder, beob:Z.beob, hC:H, hF:0, opt:{}, pp:{cx:0, cy:0, sig:1, frei:false}};
}
// Fehler einer Lage g gegen die Wahrheit am Abschnitt: Lage im Mittel ueber die Schluesselbilder (Kamera in F0), Gier
const fehlerAb=(A,g)=>{ let d=0, n=0, w=0; for(const x of A.bilder){ const c=[x.bildErg.camTo[12], x.bildErg.camTo[14]], p=G.gPlan(g, c), q=G.gPlan(x.wahr.g, c);
  d+=Math.hypot(p[0]-q[0], p[1]-q[1]); w+=wrap(g.psi-x.wahr.g.psi); n++; } return {d:d/n, psi:w/n, dy:g.ty-A.bilder[0].wahr.g.ty}; };
// Lauf: Kern = Abschnitt 0 (g Einheit, wie die Sim); je Abschnitt in Zeitfolge: nurT/zurueck mit sigma <= 5 cm / 1° an einen
// verbundenen Vorgaenger -> sofort (3.2.2 a); sonst G.registriere; zweiter Durchgang fuer die lokal gebliebenen.
function t3Lauf(name, opt, st){
  const e=T3.sim(T3.WAHRHEIT, {G, ...opt}), WT=e.welt, Z=t3Aufbereiten(e), rnd=G.KG.rnd(opt.seed*7919+13), erg=[];
  const wahrCuts=e.schnitteWahr.length, cutsOk=Z.S.length===wahrCuts && Z.S.every((s,i)=>Math.abs(s.t-e.schnitteWahr[i].t)<1e-9);
  Z.ab[0].g={psi:0, tx:0, ty:0, tz:0}; Z.ab[0].g0={...Z.ab[0].g}; Z.ab[0].stufe='verbunden';
  for(let durch=0;durch<2;durch++) for(let k=1;k<Z.ab.length;k++){ const A=Z.ab[k]; if(A.stufe==='verbunden') continue;
    const s=Z.S[k-1], V=Z.ab[k-1]; A.g0=null; G.ketteStart(Z.S, Z.ab);
    let r=null, art;
    if((s.klasse==='nurT' || s.klasse==='zurueck') && s.bindung.sP<=0.05 && s.bindung.sY<=D2R && V.stufe==='verbunden'){ A.g={...A.g0}; A.stufe='verbunden'; art='kette'; }
    else { const KZ=karteFuer(WT, Z, k, rnd, st), n0=nVorhersagen, [rr, ms]=zeit(()=>G.registriere(KZ, k)); r=rr; r.ms=ms; r.n=nVorhersagen-n0;
      if(r.gewaehlt>=0){ A.g={...r.hyp[r.gewaehlt].g}; A.stufe='verbunden'; } art='reg'; }
    const x=erg.find(y=>y.k===k); const neu={k, art, durch, klasse:s.klasse, sArt:s.art, r, g:A.g, f:A.g ? fehlerAb(A, A.g) : null,
      fBest:r && r.hyp.length ? fehlerAb(A, r.hyp[0].g) : null, f0:fehlerAb(A, A.g0 || {psi:0, tx:0, ty:0, tz:0}), wahr:A.bilder.length ? A.bilder[0].wahr.g : null};
    if(x) Object.assign(x, neu); else erg.push(neu); }
  erg.sort((a,b)=>a.k-b.k);
  return {name, e, Z, erg, cutsOk, wahrCuts};
}
const T3an=process.env.T3!=='0';
const richtig=x=>x.g && x.f && x.f.d<0.10 && Math.abs(x.f.psi)<2*D2R;
// Pose-Korrektur nach Drift (10.3 'Pose-Korrekturen 20-60 cm'): Abschnitt A (Kern) driftet glatt um D (verschmierte Korrektur
// der Sim ohne Schnitt, Kosinus-Rampe von 5 s bis tc - 3 s; sie wirkt nur in A), bei tc setzt ARCore mit einem Sprung K = d_A^-1
// zurueck: B liegt danach driftfrei auf dem wahren Bezug. K aus einem Vorlauf ohne Sprung (d an der ersten Zeile ab tc).
const korrektur=(seed, D, richtDeg, psiDeg, tc)=>{ const basis={kamerapfad:'rund', seed, verschmiert:[{t:5, d:D, richtDeg, psiDeg, dauer:tc-8}]};
  const p1=T3.sim(T3.WAHRHEIT, {G, ...basis}), kn=p1.abschnitte[0].knoten.find(k=>k.t>=tc-1e-9), z=p1.posen.find(x=>x.t>=tc-1e-9), Ks=G.gInv({psi:kn.d[0], tx:kn.d[1], ty:kn.d[2], tz:kn.d[3]});
  const cA=[z.cam[0], z.cam[2]], qq=G.gPlan(Ks, cA), dv=[qq[0]-cA[0], qq[1]-cA[1]];
  return {...basis, spruenge:[{t:tc, d:Math.hypot(dv[0], dv[1]), richtDeg:Math.atan2(dv[1], dv[0])*R2D, psiDeg:Ks.psi*R2D, dy:Ks.ty}]}; };
// Szenarien 10.3 (je Eintrag [Familie, Sim-Optionen]): Spruenge 0,2-2 m / 2-40°, Luecken 0,1-8 s, T-Wechsel 1-15 cm (Pose stetig),
// Gier +-10°, Pose-Korrekturen 20-60 cm (4 Samen, je 5 Faelle mit eigener Richtung, Gier und Schnittzeit 40-72 s; ohne
// eigene Schnittzeit waere B je Samen derselbe Abschnitt und D verschoebe nur den Start der Kette)
const ts=[20, 45, 70, 95, 120, 145];
function hauptsatz(){ const SZ=[];
  for(const seed of [1, 2, 3]){
    const dr=[0, 60, 150, 230, 300, 20].map(x=>x+37*seed);
    SZ.push(['spruenge', {kamerapfad:'rund', seed, wiederholen:2, spruenge:[[0.2, 2], [0.5, 10], [1.0, -25], [2.0, 40], [0.8, -5], [1.5, 15]].map(([d, psiDeg], i)=>({t:ts[i], d, psiDeg, richtDeg:dr[i],
      ...(i%2 ? {dT:{psiDeg:psiDeg/2, x:0.2}} : {})}))}]);
    SZ.push(['luecken', {kamerapfad:'rund', seed:10+seed, wiederholen:2, spruenge:[0.1, 0.5, 1, 3, 5, 8].map((l, i)=>({t:ts[i], luecke:l, d:i%2 ? 0.4+0.2*i : 0, psiDeg:i%2 ? 5+3*i : 0, richtDeg:dr[i]}))}]);
    SZ.push(['twechsel', {kamerapfad:'rund', seed:20+seed, wiederholen:2, tWechsel:[0.01, 0.03, 0.05, 0.08, 0.12, 0.15].map((d, i)=>({t:ts[i], d, richtDeg:dr[i], psiDeg:[0, 0.5, 1, 2, 3, 0.2][i], dy:0.002*i}))}]);
  }
  SZ.push(['gier+10', {kamerapfad:'rund', seed:31, spruenge:[{t:35, d:0.3, psiDeg:10, richtDeg:45}]}]);
  SZ.push(['gier-10', {kamerapfad:'rund', seed:32, spruenge:[{t:35, d:0.3, psiDeg:-10, richtDeg:45}]}]);
  for(const seed of [50, 51, 52, 53]) [0.2, 0.3, 0.4, 0.5, 0.6].forEach((D, j)=>SZ.push(['korrektur', korrektur(seed, D, (53*seed+72*j)%360, [0.5, -1, 1.5, -0.5, 1][j], [40, 50, 60, 45][seed-50]+3*j)]));
  return SZ; }
// Gegenprobe mit frischen Samen 10-15 und 80-91 (Aufbau wie design/bau/P-A/gegenprobe.mjs; die dortigen Samen 4-9 liefen in
// der Nachbesserung P-A bei der Wahl von REG.tauA, nachIter und der Kette mit und sind darum nicht mehr unabhaengig): je
// Samen Spruenge 0,2-2 m / 2-40° (die Haelfte mit Bodenbezugs-Aenderung), Luecken 0,1-8 s (mit oder ohne Sprung), T-Wechsel
// 1-15 cm (Gier 0-3°), je 6 Ereignisse im Abstand 25 s; dazu 12 Pose-Korrekturen mit D 20-60 cm, Richtung, Gier +-1,5°,
// Schnitt 35-60 s. Einmal gelaufen und so festgeschrieben, nicht daran abgestimmt.
function gegenprobe(){ const L=[];
  for(const seed of [10, 11, 12, 13, 14, 15]){ const r=G.KG.rnd(1000+seed), U=(a,b)=>a+(b-a)*r(), V=()=>r()<0.5 ? -1 : 1;
    L.push(['spruenge', {kamerapfad:'rund', seed:100+seed, wiederholen:2, spruenge:ts.map(t=>{ const d=U(0.2, 2), p=V()*U(2, 40); return {t, d, psiDeg:p, richtDeg:U(0, 360), ...(r()<0.5 ? {dT:{psiDeg:p/2, x:U(-0.3, 0.3)}} : {})}; })}]);
    L.push(['luecken', {kamerapfad:'rund', seed:200+seed, wiederholen:2, spruenge:ts.map(t=>({t, luecke:U(0.1, 8), ...(r()<0.5 ? {d:U(0.2, 2), psiDeg:V()*U(2, 40), richtDeg:U(0, 360)} : {})}))}]);
    L.push(['twechsel', {kamerapfad:'rund', seed:300+seed, wiederholen:2, tWechsel:ts.map(t=>({t, d:U(0.01, 0.15), richtDeg:U(0, 360), psiDeg:U(0, 3)*V(), dy:U(-0.01, 0.01)}))}]); }
  const r=G.KG.rnd(9001), U=(a,b)=>a+(b-a)*r();
  for(let i=0;i<12;i++) L.push(['korrektur', korrektur(80+i, U(0.2, 0.6), U(0, 360), U(-1.5, 1.5), Math.round(U(35, 60)))]);
  return L; }
const familien=E=>{ const m=new Map(); for(const x of E){ let f=m.get(x.lauf); if(!f) m.set(x.lauf, f={n:0, r:0, ang:0, falsch:0}); f.n++; if(richtig(x)) f.r++;
  if(x.r && x.r.gewaehlt>=0){ f.ang++; if(!richtig(x)) f.falsch++; } } return m; };
const famText=m=>[...m].map(([k,f])=>`${k} ${f.r}/${f.n}`).join(', ');
const falschText=F=>F.map(x=>`${x.lauf} s${x.seed} ab ${x.k}: ${(100*x.f.d).toFixed(0)} cm / ${(x.f.psi*R2D).toFixed(1)}°`).join('; ');
const mitName=L=>L.flatMap(l=>l.erg.map(x=>({...x, lauf:l.name, seed:l.e.opt.seed})));
if(T3an){
  const SZ=hauptsatz();
  const L=[], [, msGes]=zeit(()=>{ for(const [n, o] of SZ) L.push(t3Lauf(n, o)); });
  chk(`T3: Schnitte = wahre Schnitte der Sim in allen ${L.length} Laeufen (Zeit genau)`, L.every(l=>l.cutsOk), L.filter(l=>!l.cutsOk).map(l=>`${l.name} s${l.e.opt.seed}: ${l.Z.S.length}/${l.wahrCuts}`).join(', ') || `${L.reduce((s,l)=>s+l.wahrCuts, 0)} Schnitte`);
  const alle=mitName(L);
  const regAll=alle.filter(x=>x.art==='reg'), angenommen=regAll.filter(x=>x.r.gewaehlt>=0), falschAng=angenommen.filter(x=>!richtig(x));
  const nR=alle.filter(richtig).length, fam=familien(alle), fk=fam.get('korrektur');
  chk(`T3 10.3: >= 95 % der Abschnitte richtig (< 10 cm, < 2°) mit Platzhalter-M6 (g = gewaehlte Hypothese bzw. Kette)`, nR>=0.95*alle.length, `${nR} von ${alle.length} (${f1(100*nR/alle.length)} %); je Familie ${famText(fam)}`);
  chk('T3 10.3: 0 falsch angenommene Registrierungen (gewaehlt mit Fehler >= 10 cm oder >= 2°)', falschAng.length===0, falschText(falschAng) || `${angenommen.length} angenommen`);
  chk('T3 10.3 Pose-Korrekturen 20-60 cm (A driftet bis zum Schnitt, B driftfrei auf dem wahren Bezug): >= 95 % richtig, 0 falsch angenommen',
    fk && fk.r>=0.95*fk.n && fk.falsch===0, fk ? `${fk.r} von ${fk.n} richtig, ${fk.ang} angenommen, ${fk.falsch} falsch` : 'fehlt');
  const gp=alle.filter(x=>/^gier/.test(x.lauf) && x.k===1);
  const gs=gp.map(x=>({soll:x.lauf==='gier+10' ? 10 : -10, ist:x.g ? wrap(x.g.psi-0)*R2D : NaN}));
  chk('T3 10.3: Gier-Vorzeichen: wahres Δψ = +10° wird +10° ± 0,3° geschaetzt (ebenso -10°), nicht mit falschem Vorzeichen', gs.length===2 && gs.every(x=>Math.abs(x.ist-x.soll)<=0.3),
    gs.map(x=>`${x.soll}° -> ${f2(x.ist)}°`).join(', '));
  const ms=regAll.map(x=>x.r.ms), nv=regAll.map(x=>x.r.arbeit.vorhersagen), msMax=Math.max(...ms);
  chk('T3: Registrierung je Abschnitt <= 2000 Vorhersagen (gezaehlt im Platzhalter und in arbeit gleich)', regAll.every(x=>x.r.n===x.r.arbeit.vorhersagen && x.r.n<=2000),
    `Median ${q(nv, 0.5)}, Max ${Math.max(...nv)}`);
  chk('T3: Registrierung je Abschnitt Mac: Median und p90 <= 100 ms (das Maximum steht getrennt als Befund)', q(ms, 0.5)<=100 && q(ms, 0.9)<=100, `Median ${f1(q(ms, 0.5))} ms, p90 ${f1(q(ms, 0.9))} ms`);
  notiz(`${msMax<=100 ? '[M]' : 'OFFEN'} Rechenzeit der Registrierung (Mac, Platzhalter): Maximum ${f1(msMax)} ms ${msMax<=100 ? '<=' : '>'} 100 ms (10.3 gilt je Registrierung; Hebel: Raster im Modus ganz)`);
  notiz(`[M] T3: ${L.length} Laeufe, ${alle.length} Abschnitte (ohne Kern), ${regAll.length} Registrierungen, davon ${angenommen.length} angenommen; Gesamtzeit ${(msGes/1000).toFixed(1)} s`);
  for(const l of L){ notiz(`  ${l.name} s${l.e.opt.seed}: `+l.erg.map(x=>`${x.k}:${x.sArt}/${x.klasse}/${x.art}${x.r ? (x.r.gewaehlt>=0 ? '+' : '-')+' v'+f2(x.r.verhaeltnis)+' n'+(x.r.hyp[0] ? x.r.hyp[0].nSeg : 0) : ''}`
    +(x.f ? ` ${(100*x.f.d).toFixed(1)}cm/${(x.f.psi*R2D).toFixed(2)}°` : x.fBest ? ` [beste ${(100*x.fBest.d).toFixed(0)}cm/${(x.fBest.psi*R2D).toFixed(1)}°]` : ' lokal')).join('  ')); }
  // Max-Mixture am wahren g: stetig hat die kleineren Kosten an Spruengen, Luecken, T-Wechseln und Korrekturen (Kamera in F0 stetig)
  const mmTab=[]; let mmOk=0, mmN=0;
  for(const l of L){ for(let i=0;i<l.Z.S.length;i++){ const s=l.Z.S[i], A=l.Z.ab[i], B=l.Z.ab[i+1]; if(!A.bilder.length || !B.bilder.length) continue;
    const gA=A.bilder[A.bilder.length-1].wahr.g, gB=B.bilder[0].wahr.g, R=G.resKette(s, gA, gB), ks=R.komp.map(k=>mmKosten(R.r, k)), wahl=R.komp[ks.indexOf(Math.min(...ks))].name;
    mmN++; if(wahl==='stetig') mmOk++; mmTab.push(`${l.name[0]}${s.klasse[0]}:${wahl[0]}${f1(chi2(R.r, R.komp[0].sigma))}`); } }
  chk('Max-Mixture am wahren g (T3): Komponente stetig billiger an allen Spruengen, Luecken, T-Wechseln und Korrekturen', mmOk===mmN, `${mmOk} von ${mmN}`);
  notiz('[M] Max-Mixture am wahren g, je Schnitt Lauf/Klasse:Wahl chi²_stetig: '+mmTab.join(' '));

  // Derselbe Hauptsatz mit dem echten G.lmVorhersage (M5, raumskizze-landmarken.js), gezaehlt wie der Platzhalter
  {
    G.lmVorhersage=(...a)=>{ nVorhersagen++; return lmEcht(...a); };
    const LE=[], [, msE]=zeit(()=>{ for(const [n, o] of SZ) LE.push(t3Lauf(n, o)); });
    const E=mitName(LE), R=E.filter(x=>x.art==='reg'), An=R.filter(x=>x.r.gewaehlt>=0), Fa=An.filter(x=>!richtig(x)), nRe=E.filter(richtig).length, nvE=R.map(x=>x.r.arbeit.vorhersagen), msR=R.map(x=>x.r.ms);
    chk('T3 10.3 mit echtem M5 (G.lmVorhersage aus raumskizze-landmarken.js, Ober- und Bodenkante): >= 95 % richtig, 0 falsch angenommen, <= 2000 Vorhersagen',
      LE.every(l=>l.cutsOk) && nRe>=0.95*E.length && Fa.length===0 && R.every(x=>x.r.n===x.r.arbeit.vorhersagen && x.r.n<=2000),
      `${nRe} von ${E.length} (${f1(100*nRe/E.length)} %), ${An.length} von ${R.length} angenommen, falsch ${Fa.length}${Fa.length ? ': '+falschText(Fa) : ''}; Vorhersagen Max ${Math.max(...nvE)}`);
    notiz(`[M] echtes M5: je Familie richtig ${famText(familien(E))}; Registrierung ms Median ${f1(q(msR, 0.5))}, p90 ${f1(q(msR, 0.9))}, Max ${f1(Math.max(...msR))}; Gesamtzeit ${(msE/1000).toFixed(1)} s`);
    // Bodenkante (Befund der Abnahme): mit echtem M5 und nur den Boden-Beob eines Abschnitts passen Beob ueber unten
    G.lmVorhersage=lmEcht;
    const e=T3.sim(T3.WAHRHEIT, {G, ...SZ[0][1]}), Z=t3Aufbereiten(e); Z.ab[0].g={psi:0, tx:0, ty:0, tz:0}; Z.ab[0].stufe='verbunden'; G.ketteStart(Z.S, Z.ab);
    const KZ=karteFuer(e.welt, Z, 1, G.KG.rnd(7)), g00={...Z.ab[1].g0}, nur=a=>{ Z.ab[1].g0={...g00}; Z.ab[1].reg=null; return G.registriere(a ? {...KZ, beob:KZ.beob.filter(b=>b.art===a)} : KZ, 1); };
    const rb=nur('boden'), rd=nur('decke'), rz=nur(null), fb=rb.hyp[0] ? fehlerAb(Z.ab[1], rb.hyp[0].g) : null, n=r=>r.hyp[0] ? r.hyp[0].nSeg : 0;
    chk('registriere mit echtem M5: nur Boden-Beob -> sie passen ueber die Bodenkante (unten), beste Lage < 10 cm; Decke und Boden zusammen mehr passende Segmente als nur Decke',
      n(rb)>0 && fb.d<0.10 && n(rz)>n(rd), `nSeg nur Boden ${n(rb)} (beste ${fb ? (100*fb.d).toFixed(1)+' cm' : '-'}), nur Decke ${n(rd)}, beide ${n(rz)}`);
    G.lmVorhersage=lmPlatzhalter;
  }
  // Gegenprobe mit frischen Samen, mit Platzhalter und mit echtem M5: Schnitte wie wahr, >= 95 % richtig und 0 falsch, gesamt und je Familie
  { const GP=gegenprobe();
    for(const [vName, lm] of [['Platzhalter', lmPlatzhalter], ['echtes M5', (...a)=>{ nVorhersagen++; return lmEcht(...a); }]]){
      G.lmVorhersage=lm;
      const LG=GP.map(([n, o])=>t3Lauf(n, o)), E=mitName(LG), fg=familien(E), nRg=E.filter(richtig).length, Fa=E.filter(x=>x.r && x.r.gewaehlt>=0 && !richtig(x));
      G.lmVorhersage=lmPlatzhalter;
      chk(`T3 Gegenprobe ${vName} (${LG.length} Laeufe, Samen 10-15 und 80-91): Schnitte wie wahr, >= 95 % richtig, 0 falsch angenommen, je Familie >= 95 %`,
        LG.every(l=>l.cutsOk) && nRg>=0.95*E.length && Fa.length===0 && [...fg.values()].every(f=>f.r>=0.95*f.n),
        `${nRg} von ${E.length} (${f1(100*nRg/E.length)} %), falsch ${Fa.length}${Fa.length ? ': '+falschText(Fa) : ''}; je Familie ${famText(fg)}`); } }

  // Wiederholbarkeit und Hysterese der Registrierung (ein Abschnitt aus 'spruenge' s1)
  {
    const [n0, o0]=SZ[0], A1=t3Lauf(n0, o0), A2=t3Lauf(n0, o0);
    const gl=A1.erg.every((x,i)=>{ const y=A2.erg[i]; return (!x.r && !y.r) || (x.r && y.r && x.r.hyp.length===y.r.hyp.length && x.r.hyp.every((h,j)=>['psi','tx','ty','tz'].every(c=>Object.is(h.g[c], y.r.hyp[j].g[c])) && Object.is(h.kosten, y.r.hyp[j].kosten))
      && x.r.arbeit.vorhersagen===y.r.arbeit.vorhersagen); });
    chk('registriere: zwei Laeufe gleicher Eingabe bitgleich (Hypothesen, Kosten, Arbeit)', gl);
    const e=T3.sim(T3.WAHRHEIT, {G, ...o0}), Z=t3Aufbereiten(e), rnd=G.KG.rnd(5);
    Z.ab[0].g={psi:0, tx:0, ty:0, tz:0}; Z.ab[0].stufe='verbunden'; G.ketteStart(Z.S, Z.ab);
    const KZ=karteFuer(e.welt, Z, 1, rnd), r1=G.registriere(KZ, 1, {annehmen:1}), v1=r1.verhaeltnis;
    const r2=G.registriere(KZ, 1, {annehmen:1e9, loesen:Math.min(1, v1)}), r3=G.registriere(KZ, 1, {annehmen:1e9, loesen:1e9});
    chk('registriere: Hysterese - gewaehlte gleiche Lage bleibt bis verhaeltnis < loesen (annehmen hoch), darunter abgewaehlt; reg.versuche zaehlt',
      r1.gewaehlt===0 && r2.gewaehlt===0 && r3.gewaehlt===-1 && Z.ab[1].reg.versuche===3, `v ${f2(v1)}, ${r1.gewaehlt}/${r2.gewaehlt}/${r3.gewaehlt}, versuche ${Z.ab[1].reg.versuche}`);
    const KZleer={...KZ, waende:new Map([...KZ.waende].filter(([,W])=>W.rahmen!==-1))}, rl=G.registriere(KZleer, 1);
    chk('registriere: ohne globale Waende keine Hypothese, nicht gewaehlt', rl.hyp.length===0 && rl.gewaehlt===-1);
  }
  // Lokale Karte schlechter (sigma 3 cm / 1°, Hoehe 3 cm) und ohne lokale Karte (nur Gierlagen um die Kette): 0 falsch angenommen
  // (ohne lokale Karte: Ersatzwaende aus den gehobenen Beob im Vorfilter); je mit Platzhalter und mit echtem M5
  for(const [vName, lm] of [['Platzhalter', lmPlatzhalter], ['echtes M5', (...a)=>{ nVorhersagen++; return lmEcht(...a); }]])
  for(const [name, st] of [['lokal 3 cm / 1°', {rho:0.03, phiDeg:1, h:0.03, lokal:true}], ['ohne lokale Karte', {rho:0, phiDeg:0, h:0.01, lokal:false}]]){
    G.lmVorhersage=lm;
    const LV=SZ.map(([n, o])=>t3Lauf(n, o, st)), E=mitName(LV), R=E.filter(x=>x.art==='reg'), An=R.filter(x=>x.r.gewaehlt>=0), Fa=An.filter(x=>!richtig(x));
    G.lmVorhersage=lmPlatzhalter;
    chk(`T3 Variante ${name} (${vName}): 0 falsch angenommene Registrierungen`, Fa.length===0,
      falschText(Fa) || `${An.length} von ${R.length} angenommen, ${E.filter(richtig).length} von ${E.length} Abschnitten richtig; je Familie ${famText(familien(E))}`); }
  // Schwere Faelle (Annahme soll ausbleiben, wenn die Daten nicht reichen): kurze Abschnitte (2,5 s) nach einem kurzen
  // Kern (8 s), zufaellige Spruenge 0,2-2 m / 2-40°. Hier zaehlt nur: 0 falsch angenommen.
  const LS=[];
  for(const seed of [41, 42, 43, 44]){ const r=G.KG.rnd(seed), U=(a,b)=>a+(b-a)*r();
    LS.push(t3Lauf('kurz', {kamerapfad:'rund', seed, spruenge:Array.from({length:9}, (_,i)=>({t:8+2.5*i, d:U(0.2, 2), psiDeg:(r()<0.5 ? -1 : 1)*U(2, 40), richtDeg:U(0, 360),
      ...(r()<0.3 ? {luecke:U(0.1, 1.5)} : {})}))})); }
  const kurz=LS.flatMap(l=>l.erg), kReg=kurz.filter(x=>x.art==='reg'), kAng=kReg.filter(x=>x.r.gewaehlt>=0), kFalsch=kAng.filter(x=>!richtig(x));
  // Ueber 10.3 hinaus (eigener Stresstest, keine Abnahme): hier gemessen, nicht geprueft
  chk('T3 schwer: Schnitte = wahre Schnitte', LS.every(l=>l.cutsOk));
  notiz(`BEFUND T3 schwer (kurze Abschnitte 2,5 s nach kurzem Kern, Teilkarte): ${kAng.length} von ${kReg.length} Registrierungen angenommen, davon ${kFalsch.length} falsch`
    +(kFalsch.length ? ' ('+kFalsch.map(x=>`s${LS.find(l=>l.erg.includes(x)).e.opt.seed} ab ${x.k}: ${(100*x.f.d).toFixed(0)} cm / ${(x.f.psi*R2D).toFixed(1)}°`).join('; ')+')' : '')
    +`; ${kurz.filter(richtig).length} von ${kurz.length} Abschnitten richtig`);
  for(const l of LS) notiz(`  kurz s${l.e.opt.seed}: `+l.erg.map(x=>`${x.k}:${x.klasse[0]}${x.r ? (x.r.gewaehlt>=0 ? '+' : '-')+' v'+f2(x.r.verhaeltnis)+' n'+(x.r.hyp[0] ? x.r.hyp[0].nSeg : 0) : 'k'}`
    +(x.f ? ` ${(100*x.f.d).toFixed(0)}cm` : x.fBest ? ` [${(100*x.fBest.d).toFixed(0)}cm]` : '')).join(' '));
  // Max-Mixture an den Pose-Korrekturen des Hauptsatzes (B driftfrei): konstantes g_A = beste starre Passung der Kamerabahn von A
  // (Ersatz fuer M6 mit knoten: false), g_B wahr. Gemessen: Wahl nach 3.2.1 (sprung ab chi²_stetig - chi²_sprung >= 16) und, nur als
  // Messung fuer die Entscheidung zu Befund 4 der Abnahme, dieselbe Wahl ohne die Terme 0,5·rPose / 0,5·rPsi in sigma_stetig (reloc).
  const passung=A=>{ const P=A.bilder.map(x=>{ const c=x.bildErg.camTo, C=G.gAnw(x.wahr.g, [c[12], c[13], c[14]]); return [[c[12], c[14], c[13]], [C[0], C[2], C[1]]]; });
    const m=P.reduce((s,[c,C])=>[s[0]+c[0]/P.length, s[1]+c[1]/P.length, s[2]+C[0]/P.length, s[3]+C[1]/P.length, s[4]+(C[2]-c[2])/P.length], [0,0,0,0,0]);
    let a=0, b=0; for(const [c,C] of P){ const x=c[0]-m[0], z=c[1]-m[1], X=C[0]-m[2], Z=C[1]-m[3]; a+=x*X+z*Z; b+=x*Z-z*X; }
    const psi=Math.atan2(b, a), cs=Math.cos(psi), sn=Math.sin(psi); return {psi, tx:m[2]-(cs*m[0]-sn*m[1]), ty:m[4], tz:m[3]-(sn*m[0]+cs*m[1])}; };
  const mmD=[];
  for(const l of L.filter(l=>l.name==='korrektur')){ const s=l.Z.S[0], A=l.Z.ab[0], B=l.Z.ab[1], gAc=passung(A), R=G.resKette(s, gAc, B.bilder[0].wahr.g);
    const ks=R.komp.map(k=>mmKosten(R.r, k)), wahl=R.komp[ks.indexOf(Math.min(...ks))].name, sp=R.komp.find(k=>k.name==='sprung').sigma, chiSp=chi2(R.r, sp);
    const sig0=[0.03+0.7*s.dt, 0.03+0.7*s.dt, (1+45*s.dt)*D2R, 0.01+0.3*s.dt], chi=chi2(R.r, R.komp[0].sigma), chi0=chi2(R.r, sig0);
    mmD.push({D:l.e.opt.verschmiert[0].d, seed:l.e.opt.seed, wahl, chi, chiSp, chi0, wahl0:chi0-chiSp>=16 ? 'sprung' : 'stetig', rP:Math.hypot(R.r[0], R.r[1]), sP:s.bindung.sP, rPose:s.rPose, klasse:s.klasse}); }
  notiz('[M] Max-Mixture an den Pose-Korrekturen (B driftfrei), je Fall D/Klasse/rPose/sP: |r_P|, chi²_stetig 3.2.1 -> Wahl | ohne 0,5·rPose-Terme: chi² -> Wahl: '
    +mmD.map(x=>`D ${x.D} s${x.seed} ${x.klasse} ${(100*x.rPose).toFixed(0)}/${(100*x.sP).toFixed(0)} cm: ${(100*x.rP).toFixed(1)} cm, ${f1(x.chi)} -> ${x.wahl} | ${f1(x.chi0)} -> ${x.wahl0}`).join('; '));
  notiz(`OFFEN 10.3 Max-Mixture (Entscheid Tobias, Befund 4): sprung an Pose-Korrekturen 20-60 cm in ${mmD.filter(x=>x.wahl==='sprung').length} von ${mmD.length} Faellen mit sigma aus 3.2.1; `
    +`ohne die Terme 0,5·rPose / 0,5·rPsi in ${mmD.filter(x=>x.wahl0==='sprung').length} von ${mmD.length}`);
  chk('Max-Mixture an den Pose-Korrekturen: Wahl der kleinsten Kosten = Regel 3.2.1 (sprung genau ab chi²_stetig - chi²_sprung >= 16)', mmD.length>0 && mmD.every(x=>(x.chi-x.chiSp>=16)===(x.wahl==='sprung')),
    mmD.map(x=>f2(x.chi)).join(', '));

  // Knoten auf T3 mit Drift (Zufallsweg, Staerke wie G.KG.KNOTEN), Zuordnung exakt (eine Beob je Schluesselbild und Wahrheitskante)
  {
    const e=T3.sim(T3.WAHRHEIT, {G, ...T3.SITZUNGEN.drift}), Z=t3Aufbereiten(e), A=Z.ab[0], WT=e.welt, K=G.KG.KNOTEN;
    const beob=[], ges=new Set();
    for(const b of Z.beob){ if(!b.schluessel || b.wand<0 || b.kante>1) continue; const key=b.k+':'+b.wand+':'+b.kante; if(ges.has(key)) continue; ges.add(key); beob.push({...b, L:b.wand+':'+b.kante}); }
    const lauf=(bis)=>{ const X={...A, t1:Math.min(A.t1, bis), stufe:'verbunden', knoten:null}; G.knotenSetzen(X, e.posen.filter(z=>z.t<=bis), beob.filter(b=>b.t<=bis)); return X; };
    const X=lauf(Infinity), Kn=X.knoten;
    const nK=Kn ? Kn.t.length : 0, iv=[]; let ok1=nK>=3, ok2=true;
    for(let j=1;j<nK;j++){ const B=beob.filter(b=>b.t>Kn.t[j-1] && b.t<=Kn.t[j]), ph=new Set(B.map(b=>Math.round(((WT.waende[b.wand].phi%Math.PI)+Math.PI)%Math.PI/(Math.PI/2))%2));
      const dt=Kn.t[j]-Kn.t[j-1], ds=Kn.s[j]-Kn.s[j-1]; iv.push(`${Kn.t[j].toFixed(1)} s/${ds.toFixed(1)} m/${B.length}/${ph.size}R`);
      if(!(dt>=K.dT-1e-9 || ds>=K.dS-1e-9) || B.length<K.minBeob || ph.size<2) ok2=false; }
    chk('knotenSetzen (T3 Drift, 170 s): Knoten nur nach dT 15 s oder dS 3 m und mit >= 30 Schluessel-Beob an 2 Wandrichtungen (unabhaengig ueber die Wahrheitswand nachgezaehlt)',
      ok1 && ok2 && Kn.t[0]===A.t0 && Kn.s[0]===0 && Kn.c.length===2*nK && Kn.d.length===0 && Kn.cov===null, `${nK} Knoten: ${iv.join(', ')}`);
    const X2=lauf(Infinity), gleich=X2.knoten && X2.knoten.t.every((t,i)=>t===Kn.t[i]) && X2.knoten.s.every((x,i)=>x===Kn.s[i]) && X2.knoten.t.length===nK;
    // nur anhaengen: erst bis 85 s, dann alles auf demselben Abschnitt; die ersten Knoten bleiben
    const Y={...A, t1:Math.min(A.t1, 85), stufe:'verbunden', knoten:null}; G.knotenSetzen(Y, e.posen.filter(z=>z.t<=85), beob.filter(b=>b.t<=85));
    const vorher=Y.knoten ? Array.from(Y.knoten.t) : []; const ref=Y.knoten; if(ref) ref.d=Float64Array.from(vorher.flatMap((_,j)=>[0.001*j, 0, 0, 0]));
    Y.t1=A.t1; G.knotenSetzen(Y, e.posen, beob);
    const prefix=vorher.length>=2 && vorher.every((t,i)=>Y.knoten.t[i]===t) && Y.knoten===ref && Y.knoten.t.length===nK && Y.knoten.t.every((t,i)=>t===Kn.t[i]) && Y.knoten.d.length===4*vorher.length;
    chk('knotenSetzen: zwei Laeufe gleich; bis 85 s, dann bis zum Ende: gesetzte Knoten bleiben, neue nur hinten, d (M6) unberuehrt, Ergebnis wie auf einmal', gleich && prefix,
      `${vorher.length} -> ${Y.knoten ? Y.knoten.t.length : 0}`);
    const L=G.knotenSetzen({...A, stufe:'lokal', knoten:null}, e.posen, beob), Kz=G.knotenSetzen({...A, t1:A.t0+25, stufe:'verbunden', knoten:null}, e.posen, beob);
    const B1=beob.map(b=>({...b, da:[1, 0, 0], db:[1, 0.2, 0.05]})), Ke=G.knotenSetzen({...A, stufe:'verbunden', knoten:null}, e.posen, B1);
    chk('knotenSetzen: lokal -> keine Knoten; Abschnitt < 2·dT -> K = 1 (null); nur eine Wandrichtung -> keine Knoten (Eck-Regel)', L===null && Kz===null && Ke===null);
    // gBei mit den Knoten: ohne d (M6 noch nicht gelaufen) gilt g
    const gB=G.gBei({g:{psi:0.1, tx:1, ty:0, tz:2}, knoten:Kn}, Kn.t[2]);
    chk('knotenSetzen + gBei: Knoten ohne d (M6 hat noch nicht verlaengert) -> gBei = g', gB.psi===0.1 && gB.tx===1 && gB.tz===2);
  }
}
console.log(out.join('\n'));
if(mess.length) console.log('\n'+mess.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
