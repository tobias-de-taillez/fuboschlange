// Prueft M10 raumskizze-kartenlauf.js (ARCHITEKTUR v3, 17.9) und die Teile von T1 raumskizze-karte.mjs,
// die ohne Aufnahme pruefbar sind. Laedt vendor + geo von raumskizze-probe.html wie raumskizze-protokoll.mjs
// und fuegt M0 und M10 als eigene Bloecke vor globalThis.RAUMSKIZZE=G; ein, wenn die Seite sie nicht traegt.
// Die anderen Module (M3-M9) sind hier Attrappen mit fester Signatur aus 4 (Aufruf-Protokoll, steuerbar);
// die echten Moduldateien werden nicht geladen, damit der Test nur M10 prueft. Ausnahme: der Block "Weg (a) mit
// echtem M7" haengt raumskizze-umriss.js an G (Fixture wie test/karte-umriss.mjs), um die Hysterese ueber vorher
// im Zusammenspiel zu pruefen; der naechste Block setzt die Attrappen wieder.
//
//   node test/karte-kartenlauf.mjs            (RAUMSKIZZE_HTML=pfad: anderer Stand der Seite)
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';

const read=f=>readFileSync(new URL('../'+f, import.meta.url), 'utf8');
const html=process.env.RAUMSKIZZE_HTML ? readFileSync(process.env.RAUMSKIZZE_HTML, 'utf8') : read('raumskizze-probe.html');
const pick=id=>{ const m=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)); if(!m) throw new Error(`Script-Block "${id}" nicht gefunden`); return m[1]; };
const DATEI='raumskizze-kartenlauf.js', src=read(DATEI), M0=read('raumskizze-karte-grund.js');
const mark='globalThis.RAUMSKIZZE=G;';
const ohneKomm=s=>s.replace(/\/\/.*$/gm, '');
let geo=pick('geo'); const at=geo.lastIndexOf(mark); if(at<0) throw new Error('geo-Block ohne '+mark);
const traegt=geo.includes('{\n'+src+'}\n') || geo.includes('{\n'+src+'\n}\n'), traegtM0=/G\.gBei=/.test(ohneKomm(geo));
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G0keys=new Set(Object.keys(globalThis.RAUMSKIZZE));
let ein='';
if(!traegtM0) ein+='{\n'+M0+'\n}\n';
if(!traegt) ein+='{\n'+src+'\n}\n';
geo=geo.slice(0, at)+ein+geo.slice(at);
new Function('"use strict";\n'+pick('vendor')+'\n'+geo)();
const G=globalThis.RAUMSKIZZE;
const T1=await import('../raumskizze-karte.mjs');

const out=[]; let ok=true;
const chk=(name,cond,info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const D2R=Math.PI/180, KL=G.KG.KL;
const NAMEN=['karteNeu','kartePose','karteBild','karteEreignis','karteErfassung','karteTiefe','karteEbenen','karteEntscheid','karteRechnen','karteAbschluss','karteRundeKopf'];
const ohneMs=s=>JSON.stringify(s, (k,v)=>k==='ms' ? undefined : v);

// ------------------------------------------------- Datei und Einbau
{
  const Gs={}; let fehler=null; try{ new Function('G', '"use strict";\n'+src)(Gs); }catch(x){ fehler=x.message; }
  const neu=Object.keys(Gs).sort(), soll=[...NAMEN].sort();
  chk('Datei laedt allein (new Function, leeres G) und haengt genau die 11 Namen aus 4 an G', !fehler && JSON.stringify(neu)===JSON.stringify(soll), fehler || neu.join(','));
  const kollision=NAMEN.filter(k=>G0keys.has(k) && !traegt);
  chk('keine Kollision mit Namen, die der geo-Block schon traegt', !kollision.length, kollision.join(',') || (traegt ? 'Seite traegt M10 wortgleich' : 'eingefuegt'));
  chk('Datei endet mit genau einem Zeilenumbruch, kein import/export/</script>, keine aeusseren Klammern',
    /[^\n]\n$/.test(src) && !/^\s*(import|export)\s/m.test(src) && !src.includes('</script>') && !/^\{\s*$/m.test(src.split('\n')[0]));
  const code=ohneKomm(src), verboten=[/Math\.random/, /Date\.now/, /\bwindow\b/, /\bdocument\b/, /\bself\b/, /\bsetTimeout\b/].filter(r=>r.test(code));
  const uhr=(code.match(/performance\.now/g)||[]).length, uhrNur=/const mlUhr=KZ=>\{[^\n]*performance\.now\(\)/.test(code);
  chk('kein Math.random, kein Date.now, kein DOM/Worker-Global; performance.now nur in mlUhr (Messung)', !verboten.length && uhr===1 && uhrNur, verboten.map(String).join(' ') || `${uhr}× performance.now`);
  chk('Hilfsfunktionen blocklokal: keine function- oder var-Deklaration (Annex B haengt sie im nicht strikten geo-Block global an)', !/^\s*function\s/m.test(code) && !/^\s*var\s/m.test(code));
  { const vm=await import('node:vm'), vorher=new Set(Object.keys(globalThis)); globalThis.G={};
    vm.runInThisContext('{\n'+src+'\n}\n');                       // wie der geo-Block: klassisches Skript, nicht strikt, Block auf oberster Ebene
    const neu=Object.keys(globalThis).filter(k=>!vorher.has(k) && k!=='G'); delete globalThis.G;
    chk('als klassisches Skript (Block auf oberster Ebene, nicht strikt) geladen: keine neuen globalen Namen', !neu.length, neu.join(',') || 'keine'); }
  chk('keine atan2 auf Matrixeintraege (Gier nur ueber G.blickPlan, 1.2; Muster wie test/karte-grund.mjs)', !/atan2\s*\([^)]*\b(m|camTo|pose|T|M|mat)\s*\[\s*(0|2|8|10)\s*\]/.test(code));
  chk('Umlaute nur in Zeichenketten, nicht in Kommentaren', !src.split('\n').some(l=>/\/\/.*[äöüÄÖÜß]/.test(l)));
}

// ------------------------------------------------- Attrappen M3-M9 (feste Signatur, Protokoll, steuerbar)
let LOG=[], STEUER={}, KZjetzt=null;
const log=n=>LOG.push(n);
const sectionOf=(S,t,e)=>{ let n=0; for(const c of S) if(c.epA!==c.epB ? e>=c.epB : (e>c.epA || (e===c.epA && t>=c.t))) n++; return n; };
function attrappen(st={}){
  STEUER=st; LOG=[];
  G.sessionCuts=(posen, breaks, ereignisse, o, prev)=>{ log('sessionCuts'); const S=[];
    for(let i=1;i<posen.length;i++) if(posen[i].ep!==posen[i-1].ep){ const k=STEUER.klasse ? STEUER.klasse(i, posen) : {klasse:'nurT', sP:0.01, sY:0.2*D2R};
      S.push({t:posen[i].t, epA:posen[i-1].ep, epB:posen[i].ep, art:'t-wechsel', klasse:k.klasse, grund:null, dt:posen[i].t-posen[i-1].t, cb:posen[i-1].cam, ca:posen[i].cam,
        pb:[...posen[i-1].cam, 0], pa:[...posen[i].cam, 0], rPose:0, rPsi:0, dCam:0, dT:{psi:0, tx:0, ty:0, tz:0},
        bindung:{art:k.klasse==='nurT' ? 'pose' : 'kamera', sP:k.sP, sY:k.sY, sH:0.01, kern:'mm', mm:[], k:null}, anker:[], zurueckZu:k.zurueckZu ?? null}); }
    for(const e of ereignisse) if(e.typ==='rest'){ const i=posen.findIndex(p=>p.t>=e.t); if(i>=1 && posen[i].ep===posen[i-1].ep)
      S.push({t:posen[i].t, epA:posen[i].ep, epB:posen[i].ep, art:'rest', klasse:'reloc', grund:'rest', dt:0.1, cb:posen[i-1].cam, ca:posen[i].cam, pb:[0,0,0,0], pa:[0,0,0,0],
        rPose:0.1, rPsi:0, dCam:0, dT:{psi:0, tx:0, ty:0, tz:0}, bindung:{art:'kamera', sP:0.2, sY:5*D2R, sH:0.05, kern:'mm', mm:[], k:null}, anker:[], zurueckZu:null}); }
    return S.sort((a,b)=>a.t-b.t || a.epB-b.epB); };
  G.sectionOf=(S,t,e)=>{ log('sectionOf'); return sectionOf(S,t,e); };
  G.ketteStart=(S, A)=>{ log('ketteStart'); for(let k=0;k<A.length;k++){ const a=A[k]; if(a.g0) continue; const s=S[k-1];
    a.g0=s && s.art==='rest' && A[k-1].g ? G.gBei(A[k-1], s.t) : {psi:0, tx:0, ty:0, tz:0}; } return A; };
  G.registriere=(KZ, ab, o)=>{ log('registriere:'+ab); STEUER.regAufrufe=(STEUER.regAufrufe||[]); STEUER.regAufrufe.push({ab, arbeit:o.arbeit});
    return STEUER.reg ? STEUER.reg(ab, KZ, o) : {hyp:[], gewaehlt:-1, verhaeltnis:null, arbeit:100}; };
  G.abschnittGewicht=A=>A && (A.stufe==='verbunden' || A.stufe==='locker') ? 1 : 0;
  G.knotenSetzen=(A, posen, beob, K)=>{ log('knotenSetzen:'+A.ab); return STEUER.knoten ? STEUER.knoten(A) : A.knoten; };
  G.lmAufnehmen=(KZ, b, o)=>{ log('lmAufnehmen'+(o && o.nutzer ? ':nutzer' : '')); STEUER.aufgenommen=(STEUER.aufgenommen||[]); STEUER.aufgenommen.push(b);
    const ab=sectionOf(KZ.schnitte, b.t, b.ep), A=KZ.abschnitte[ab], lokal=!A || A.stufe==='lokal' || A.stufe==='lose';
    for(const m of b.mock||[]){ const id=lokal ? m.wand+'@'+ab : m.wand; let W=KZ.waende.get(id);
      if(!W){ W={id, rahmen:lokal ? ab : -1, phi:m.phi, rho:m.rho ?? 1, cov:[1e-4, 0, 1e-4], h:'c', cls:'wand', zustand:'bestaetigt', beob:[], iv:[{s0:0, s1:1, ring:-1}], abschnitte:[ab],
        ringe:[], insel:'nein', inselRunden:0, durchblick:[], teile:[]}; KZ.waende.set(id, W); }
      const bo={id:KZ.beob.length, k:b.k, t:b.t, ab, ep:b.ep, i:0, art:'decke', L:id, c:[b.camTo[12], b.camTo[13], b.camTo[14]], da:[0,1,0], db:[0,1,0], sPx:1, f:461, len:1, nSeg:1,
        schluessel:true, nutzer:false, w:1, chi2:0, mu:16};
      KZ.beob.push(bo); W.beob.push(bo.id); }
    return {zugeordnet:(b.mock||[]).length, neu:0, befoerdert:0}; };
  G.lmEinbinden=(KZ, ab)=>{ log('lmEinbinden:'+ab); for(const W of [...KZ.waende.values()]) if(W.rahmen===ab){ const alt=W.id; KZ.waende.delete(W.id); W.id=String(W.id).replace(/@\d+$/, '');
    W.rahmen=-1; if(!KZ.waende.has(W.id)) KZ.waende.set(W.id, W); for(const b of KZ.beob) if(b.L===alt) b.L=W.id; }
    if(ab===KZ.kern) KZ.hC=2.4; return {neu:[], zusammen:[]}; };
  G.lmNeuZuordnen=(KZ, ab)=>{ log('lmNeuZuordnen'); return {geaendert:0}; };
  G.lmEcken=()=>{ log('lmEcken'); return {zugeordnet:0, neu:0}; };
  G.lmDurchblick=W=>{ log('lmDurchblick'); return STEUER.durchblick ? STEUER.durchblick(W) : {durchblick:[], unterzug:false}; };
  G.lmZusammenfuehren=()=>{ log('lmZusammenfuehren'); return {paare:[]}; };
  G.lmTrennen=()=>{ log('lmTrennen'); return {getrennt:[]}; };
  G.lmIntervalle=W=>{ log('lmIntervalle'); return W.iv; };
  G.lmHoehenklasse=W=>{ log('lmHoehenklasse'); (STEUER.klasseIds=STEUER.klasseIds||[]).push(W.id); return STEUER.klasseW ? STEUER.klasseW(W) : W.cls; };
  G.lmBloecke=()=>{ log('lmBloecke'); return {neu:0, behalten:0}; };
  G.lmAusgleich=(KZ, o)=>{ log('lmAusgleich'+(o.nurAb!=null ? ':'+o.nurAb : '')); STEUER.ausgleichOpt=(STEUER.ausgleichOpt||[]); STEUER.ausgleichOpt.push(o);
    if(STEUER.ausgleich){ const r=STEUER.ausgleich(KZ, o); if(r!=='weiter') return r; }
    if(o.nurAb!=null){ const A=KZ.abschnitte[o.nurAb]; if(A && !A.hLok) A.hLok={hC:2.4, sHC:0.05}; return {ok:true, iter:1, lin:0, relin:1, ldl:{n:0, nnzL:0, ordnung:null}, mm:[], rest:[]}; }
    for(const A of KZ.abschnitte) if(A.stufe==='verbunden' || A.stufe==='locker' || A.stufe==='lose' && A.g && STEUER.sigLose){ if(!A.g) A.g={...A.g0}; A.sig=STEUER.sig ? STEUER.sig(A, KZ) : {psi:0.1*D2R, max:0.01, min:0.01, ang:0, y:0.01}; }
    return {ok:true, iter:o.iter, lin:0, relin:10, ldl:{n:5, nnzL:3, ordnung:'waendeZuerst'}, mm:[], rest:STEUER.rest ? STEUER.rest(KZ) : []}; };
  G.UM_DEF={tau:0.05};
  // umrissEingabe wie M7: inselFest/ausschluss aus inselEntscheide mit der Lage aus KZ.umriss (Ring oder Kandidat derselben id)
  G.umrissEingabe=(KZ)=>{ log('umrissEingabe'); const inselFest=[], ausschluss=[], alt=KZ.umriss;
    for(const [id, wahl] of [...KZ.inselEntscheide.entries()]){ const r=alt && ((alt.ringe||[]).find(x=>x.id===id) || (alt.kandidaten||[]).find(x=>x.id===id)); if(!r || !r.pts || r.pts.length<3) continue;
      (wahl==='ja' ? inselFest : ausschluss).push({id, poly:r.pts.map(p=>[p[0], p[1]]), wahl}); }
    return STEUER.eingabe ? STEUER.eingabe(KZ, {inselFest, ausschluss}) : {lines:[], fans:[], path:[], bodenFrei:null, wBoden:0, inselFest, ausschluss}; };
  G.umriss=(inp, opt)=>{ log('umriss'+(inp.inselFest && inp.inselFest.length ? ':fest' : '')); (STEUER.umrissAufrufe=STEUER.umrissAufrufe||[]).push({inp, opt, vorher:opt.vorher, runde:KZjetzt && KZjetzt.runde});
    return STEUER.umriss ? STEUER.umriss(KZjetzt, inp, opt) : quadrat(); };
  G.inselHypothesen=(inp)=>{ log('inselHypothesen'); return STEUER.hyp ? STEUER.hyp(inp) : []; };
  G.inselBewerten=(inp, h, erg, o)=>{ log('inselBewerten'); return STEUER.bew ? STEUER.bew(h, o) : {id:h.id, dE:0, dEn:0, phi:1, pfad:false, supRing:0, seiten:0, stufe:'nein', runden:0}; };
  G.ebeneAusAR=(rec, bezug)=>({t:rec.t, id:rec.id, ab:0, phi:0, rho:1, cov:[0,0,0], extent:[0,1], quelle:'ar', wallId:null, bezug:Array.from(bezug)});
  for(const n of ['depthRays','depthLift','depthQuality','depthFloorFree','depthWallPlanes']) delete G[n];
}
const ring=(id, art, pts, waende, x={})=>({id, art, pts, waende, sup:pts.map(()=>1), hyp:pts.map(()=>false), flaeche:1, teil:false, supRing:1, phi:0, dicke:0, quelle:'schnitt',
  entscheid:'auto', exportiert:true, ...x});
const quadrat=(x={})=>({ringe:[ring('A', 'aussen', [[0,0],[4,0],[4,3],[0,3]], ['w0','w1','w2','w3'])], kandidaten:[], hypothesen:[], aufgefuellt:0, verworfen:0, innenVerworfen:[],
  nLinien:4, nZellen:9, arbeit:{schnitte:1, zellen:9}, ms:0, warn:[], ...x});
// Eingaenge: Pose (T = Bodenbezug, cam = camTo-Kamera), Bild mit Attrappen-Waenden
const m4q=(p,[x,y,z,w])=>[1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
  2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  p[0], p[1], p[2], 1];
function pose(t, ep, x, z, T=[0,0,0,0]){ const P=[x, 1.5, z], camTo=G.m4mul(G.m4inv(G.gMat(G.gAusT(T))), m4q(P, [0,0,0,1]));
  return {t, ep, pose:[...P, 0,0,0,1], T, cam:[camTo[12], camTo[13], camTo[14]], blick:G.blickPlan(camTo), flags:0}; }
const PROJ=[3.2128,0,0,0, 0,1.4399,0,0, 0,0,-1.0002,-1, 0,0,-0.2,0];
function bild(k, t, ep, mock=[], c=[0,1.5,0]){ const n=mock.length, camTo=new Float64Array(16); camTo[0]=camTo[5]=camTo[10]=camTo[15]=1; camTo[12]=c[0]; camTo[13]=c[1]; camTo[14]=c[2];
  return {k, vi:k, t, ep, camTo, proj:Float32Array.from(PROJ), flipY:false, w:287, h:640, f:461, n, seg:new Float32Array(10*n), cls:new Int8Array(n).fill(KL.O), man:new Int8Array(n).fill(-1),
    dir:new Float32Array(6*n), nTeile:new Uint8Array(n).fill(1), psi0:null, senk:null, ms:{}, mock}; }
// Ein Abschnitt mit zwei Wandrichtungen und nBilder Schluesselbildern
const zweiWaende=[{wand:'w0', phi:0}, {wand:'w1', phi:Math.PI/2}];
function neu(o={}){ const KZ=G.karteNeu({umrissJede:1, ...o}); KZjetzt=KZ; return KZ; }
function speise(KZ, t0, t1, ep, mock, dt=0.1, k0=null){ let k=k0 ?? Math.round(t0*10); for(let t=t0; t<=t1+1e-9; t+=dt){ G.kartePose(KZ, pose(+t.toFixed(3), ep, t*0.2, 0)); G.karteBild(KZ, bild(k++, +t.toFixed(3), ep, mock)); } }

// ------------------------------------------------- Reihenfolge der Runde (4: Schritte 1-10, 4a, 5a)
{
  attrappen({rest:()=>[]});
  const KZ=neu({knoten:true}); speise(KZ, 0, 1.0, 0, zweiWaende);
  G.karteRechnen(KZ);                                         // Kern entsteht
  speise(KZ, 1.1, 1.5, 0, zweiWaende); G.kartePose(KZ, pose(1.6, 1, 0.3, 0)); G.karteBild(KZ, bild(99, 1.6, 1, zweiWaende));
  LOG=[]; G.karteRechnen(KZ);
  const erste=n=>LOG.findIndex(x=>x===n || x.startsWith(n+':'));
  const folge=['sessionCuts','knotenSetzen','lmBloecke','lmAusgleich','lmNeuZuordnen','lmDurchblick','lmZusammenfuehren','lmTrennen','lmIntervalle','lmHoehenklasse','umrissEingabe','umriss','inselHypothesen'];
  const idx=folge.map(erste);
  chk('Runde: Schritte in fester Reihenfolge 1 (sessionCuts) … 4a (knotenSetzen) … 5 (lmBloecke, lmAusgleich) … 6 … 7 … 8 (umriss)', idx.every(i=>i>=0) && idx.every((x,i)=>i===0 || x>idx[i-1]),
    folge.map((n,i)=>`${n}@${idx[i]}`).join(' '));
  chk('Runde: lmAusgleich global vor dem lokalen (nurAb) des neuen Abschnitts', LOG.indexOf('lmAusgleich')<LOG.indexOf('lmAusgleich:1') && LOG.includes('lmAusgleich:1'), LOG.filter(x=>x.startsWith('lmAusgleich')).join(','));
  const K=G.karteRundeKopf(KZ);
  chk('RundeKopf: Felder wie 3.7 (arbeit mit lin und knoten, lago, ldl, kopf), dazu arbeit.lm (Schritt 7, Abweichung)', JSON.stringify(Object.keys(K))===JSON.stringify(['runde','t','kBis','tPose','epoche','verdraengt','arbeit','lago','ldl','ms','kopf'])
    && JSON.stringify(Object.keys(K.arbeit))===JSON.stringify(['iter','lin','relin','reg','umriss','hyp','knoten','lm']) && /^[0-9a-f]{16}$/.test(K.kopf), Object.keys(K).join(',')+' | arbeit '+Object.keys(K.arbeit).join(','));
  chk('RundeKopf: kBis = letzter eingespeister Bildauftrag, tPose = letzte PoseZeile, epoche', K.kBis===99 && K.tPose===1.6 && K.epoche===1, `${K.kBis} ${K.tPose} ${K.epoche}`);
  K.arbeit.iter=-1; chk('karteRundeKopf liefert eine Kopie', G.karteRundeKopf(KZ).arbeit.iter!==-1);
}

// ------------------------------------------------- Warteschlange (5.2)
{
  attrappen();
  const KZ=neu(); G.kartePose(KZ, pose(0, 0, 0, 0));
  const r1=G.karteBild(KZ, bild(1, 0.05, 0, zweiWaende));
  chk('Bild wartet auf eine PoseZeile mit t >= bildErg.t', r1.wartet===true && KZ.warte.length===1 && !LOG.includes('lmAufnehmen'));
  G.kartePose(KZ, pose(0.1, 0, 0.02, 0));
  chk('PoseZeile mit t >= bildErg.t gibt das Bild frei (lmAufnehmen, warte leer)', KZ.warte.length===0 && LOG.filter(x=>x==='lmAufnehmen').length===1);
  G.karteBild(KZ, bild(2, 0.5, 0, zweiWaende));
  G.karteEreignis(KZ, {typ:'anker', t:1.4});
  chk('bis warteMax (1 s) Sitzungszeit ohne Pose: Bild wartet weiter', KZ.warte.length===1);
  G.karteEreignis(KZ, {typ:'anker', t:1.6});
  chk('nach warteMax s Sitzungszeit gilt ep des Auftrags (freigegeben ohne Pose)', KZ.warte.length===0 && LOG.filter(x=>x==='lmAufnehmen').length===2 && KZ.bilder.get(2).ep===0);
  attrappen(); const KZ2=neu(); G.kartePose(KZ2, pose(0, 0, 0, 0));
  for(const k of [5, 3, 4]) G.karteBild(KZ2, bild(k, 0.05+k*0.01, 0, zweiWaende));
  G.kartePose(KZ2, pose(1, 0, 0, 0));
  chk('freigegebene Bilder in Reihenfolge der Auftragsnummer k', STEUER.aufgenommen.map(b=>b.k).join(',')==='3,4,5');
}

// ------------------------------------------------- Kern (1.3)
{
  const kern=(nBilder, phiB, o={})=>{ attrappen(); const KZ=neu();
    for(let i=0;i<nBilder;i++){ const t=i*0.1; G.kartePose(KZ, pose(t, 0, 0, 0)); G.karteBild(KZ, bild(i, t, 0, [{wand:'w0', phi:0}, {wand:'w1', phi:phiB}])); }
    G.karteRechnen(KZ); return KZ; };
  chk('Kern: 7 Schluesselbilder auf 2 Richtungen -> noch kein Kern', kern(7, Math.PI/2).kern===null);
  const K8=kern(8, Math.PI/2);
  chk('Kern: 8 Schluesselbilder auf 2 Richtungen (90°) -> Kern, verbunden, g = Einheit, lmEinbinden(kern) einmal', K8.kern===0 && K8.abschnitte[0].stufe==='verbunden'
    && JSON.stringify(K8.abschnitte[0].g)===JSON.stringify({psi:0, tx:0, ty:0, tz:0}) && LOG.filter(x=>x==='lmEinbinden:0').length===1);
  chk('Kern: Winkelabstand 59° -> kein Kern; 60° -> Kern (Richtung mod 180°)', kern(8, 59*D2R).kern===null && kern(8, 60*D2R).kern===0 && kern(8, Math.PI+60*D2R).kern===0 && kern(8, Math.PI-60*D2R).kern===0);
  chk('Kern: zwei Waende gleicher Richtung (Gegenflaechen, Δφ = 180°) zaehlen als eine Richtung', kern(10, Math.PI).kern===null);
  { attrappen(); const KZ=neu(); for(let i=0;i<8;i++){ G.kartePose(KZ, pose(i*0.1, 0, 0, 0)); G.karteBild(KZ, bild(i, i*0.1, 0, zweiWaende)); }
    for(const W of KZ.waende.values()) W.zustand='begrenzt'; G.karteRechnen(KZ); const z1=KZ.kern;
    attrappen(); const KZ2=neu(); for(let i=0;i<8;i++){ G.kartePose(KZ2, pose(i*0.1, 0, 0, 0)); G.karteBild(KZ2, bild(i, i*0.1, 0, zweiWaende)); }
    for(const W of KZ2.waende.values()) W.zustand='kandidat'; G.karteRechnen(KZ2);
    chk('Kern: Landmarken mit zustand begrenzt zaehlen als bestaetigt, kandidat nicht', z1===0 && KZ2.kern===null); }
  // erster Abschnitt, der die Regel erfuellt; ein spaeterer, besserer aendert nichts
  attrappen(); const KZ=neu();
  for(let i=0;i<5;i++){ G.kartePose(KZ, pose(i*0.1, 0, 0, 0)); G.karteBild(KZ, bild(i, i*0.1, 0, zweiWaende)); }
  for(let i=5;i<20;i++){ G.kartePose(KZ, pose(i*0.1, 1, 0, 0)); G.karteBild(KZ, bild(i, i*0.1, 1, zweiWaende)); }
  G.karteRechnen(KZ);
  for(let i=20;i<40;i++){ G.kartePose(KZ, pose(i*0.1, 2, 0, 0)); G.karteBild(KZ, bild(i, i*0.1, 2, zweiWaende)); }
  G.karteRechnen(KZ);
  chk('Kern: erster Abschnitt mit erfuellter Regel (Abschnitt 1, nicht 0 mit 5 Bildern), fuer die Sitzung fest', KZ.kern===1 && LOG.filter(x=>x.startsWith('lmEinbinden:1')).length===1);
}

// ------------------------------------------------- Stufen (3.2.2)
{
  // (a) nurT-Bindung mit engem sigma: sofort verbunden, g = g_A ∘ ΔT (beide Richtungen)
  const TA=[0.2, 0.5, 0.0, -0.3], TB=[0.25, 0.53, 0.02, -0.28];
  const lauf=(sP, kernZuerst=true)=>{ attrappen({klasse:()=>({klasse:'nurT', sP, sY:0.3*D2R})}); const KZ=neu();
    const vor=kernZuerst ? zweiWaende : [], nach=kernZuerst ? [] : zweiWaende;
    for(let i=0;i<12;i++){ const t=i*0.1; G.kartePose(KZ, pose(t, 0, 0, 0, TA)); G.karteBild(KZ, bild(i, t, 0, vor)); }
    for(let i=12;i<24;i++){ const t=i*0.1; G.kartePose(KZ, pose(t, 1, 0, 0, TB)); G.karteBild(KZ, bild(i, t, 1, nach)); }
    G.karteRechnen(KZ); G.karteRechnen(KZ); return KZ; };
  const dT=G.gKomp(G.gInv(G.gAusT(TA)), G.gAusT(TB)), d=(a,b)=>Math.max(Math.abs(a.psi-b.psi), Math.abs(a.tx-b.tx), Math.abs(a.ty-b.ty), Math.abs(a.tz-b.tz));
  const K1=lauf(0.04), log1=[...LOG], K2=lauf(0.04, false), K3=lauf(0.06);
  chk('Stufe (a): nurT mit σP 4 cm, σψ 0,3° an verbundenen Kern -> sofort verbunden, g = g_A ∘ ΔT (1e-12)', K1.abschnitte[1].stufe==='verbunden' && d(K1.abschnitte[1].g, dT)<1e-12
    && log1.includes('lmEinbinden:1'), K1.abschnitte[1].stufe);
  chk('Stufe (a) rueckwaerts: frueherer Abschnitt an spaeteren Kern, g = g_B ∘ ΔT^-1', K2.kern===1 && K2.abschnitte[0].stufe==='verbunden' && d(K2.abschnitte[0].g, G.gInv(dT))<1e-12);
  chk('Stufe (a): σP 6 cm > 5 cm -> bleibt lokal (nur Startwert)', K3.abschnitte[1].stufe==='lokal' && K3.abschnitte[1].g==null);
  // (b) Registrierung angenommen -> verbunden mit g der Hypothese; sonst lokal, nach 30 s lose; neue Hypothesen -> lokal
  const hypG={psi:0.3, tx:1, ty:0.01, tz:-2};
  attrappen({klasse:()=>({klasse:'reloc', sP:0.5, sY:5*D2R}), reg:(ab, KZ)=>STEUER.annehmen ? {hyp:[{g:hypG, kosten:1, nSeg:30, nRicht:2, nBilder:10}], gewaehlt:0, verhaeltnis:2, arbeit:200}
    : {hyp:(STEUER.hypListe||[]).map(g=>({g, kosten:1})), gewaehlt:-1, verhaeltnis:1.0, arbeit:200}});
  const KZ=neu(); speise(KZ, 0, 1.2, 0, zweiWaende); speise(KZ, 1.3, 2.5, 1, zweiWaende); G.kartePose(KZ, pose(2.6, 2, 0, 0)); G.karteBild(KZ, bild(200, 2.6, 2, zweiWaende));
  G.karteRechnen(KZ);
  chk('Stufe (b): ohne angenommene Registrierung bleibt der Abschnitt lokal', KZ.abschnitte[1].stufe==='lokal' && KZ.abschnitte[1].g==null && LOG.includes('registriere:1'));
  for(let t=2.7; t<33.5; t+=0.5){ G.kartePose(KZ, pose(+t.toFixed(2), 2, 0, 0)); }
  G.karteRechnen(KZ);
  chk('Stufe lokal -> lose: 30 s Sitzungszeit nach t1 (bzw. Kernbildung) ohne angenommene Registrierung; laufender Abschnitt nie', KZ.abschnitte[1].stufe==='lose' && KZ.abschnitte[2].stufe==='lokal',
    `${KZ.abschnitte[1].stufe}, t1 ${KZ.abschnitte[1].t1}, tMax ${KZ.lauf.tMax}`);
  STEUER.hypListe=[hypG]; G.kartePose(KZ, pose(33.6, 2, 0, 0)); G.karteBild(KZ, bild(300, 33.6, 1, zweiWaende)); G.karteBild(KZ, bild(310, 33.6, 1, zweiWaende)); G.karteRechnen(KZ);
  chk('Stufe lose -> lokal, sobald neue Hypothesen entstehen', KZ.abschnitte[1].stufe==='lokal', KZ.abschnitte[1].stufe);
  for(let t=33.7; t<36; t+=0.5) G.kartePose(KZ, pose(+t.toFixed(2), 2, 0, 0)); G.karteRechnen(KZ);
  chk('Stufe lose -> lokal: in der Folgerunde weiter lokal (30 s zaehlen ab der Rueckkehr, kein Flattern)', KZ.abschnitte[1].stufe==='lokal' && KZ.lauf.loseSeit[1]==null, KZ.abschnitte[1].stufe);
  for(let t=36; t<64.5; t+=0.5) G.kartePose(KZ, pose(+t.toFixed(2), 2, 0, 0)); G.karteRechnen(KZ); const z1=KZ.abschnitte[1].stufe;
  G.karteBild(KZ, bild(302, 64.0, 1, zweiWaende)); G.karteBild(KZ, bild(312, 64.0, 1, zweiWaende)); G.karteRechnen(KZ); const z2=KZ.abschnitte[1].stufe;
  STEUER.hypListe=[hypG, {...hypG, tx:hypG.tx+0.10, psi:hypG.psi+1*D2R}]; G.karteBild(KZ, bild(303, 64.0, 1, zweiWaende)); G.karteBild(KZ, bild(313, 64.0, 1, zweiWaende)); G.karteRechnen(KZ); const z3=KZ.abschnitte[1].stufe;
  STEUER.hypListe=[hypG, {...hypG, tx:hypG.tx+0.30}]; G.karteBild(KZ, bild(304, 64.0, 1, zweiWaende)); G.karteBild(KZ, bild(314, 64.0, 1, zweiWaende)); G.karteRechnen(KZ); const z4=KZ.abschnitte[1].stufe;
  chk('lose erneut nach 30 s ab Rueckkehr; dieselbe Hypothese bzw. eine nur 10 cm / 1° daneben ist nicht neu (bleibt lose); 30 cm daneben ist neu (lokal)',
    z1==='lose' && z2==='lose' && z3==='lose' && z4==='lokal', [z1, z2, z3, z4].join(','));
  STEUER.annehmen=true; G.karteBild(KZ, bild(301, 33.6, 1, zweiWaende)); G.karteBild(KZ, bild(311, 33.6, 1, zweiWaende)); G.karteBild(KZ, bild(321, 33.6, 1, zweiWaende)); G.karteRechnen(KZ);
  chk('Stufe (b): angenommene Registrierung -> verbunden (auf Probe), g = g der Hypothese (M10 schreibt g einmal beim Uebergang), A.reg und g0 gesetzt, lmEinbinden',
    KZ.abschnitte[1].stufe==='verbunden' && d(KZ.abschnitte[1].g, hypG)===0 && KZ.lauf.probe[1]!=null
    && KZ.abschnitte[1].reg.gewaehlt===0 && d(KZ.abschnitte[1].g0, hypG)===0 && LOG.includes('lmEinbinden:1'));
  // (b) zweite Haelfte: erstes sig von M6 4 cm / 0,1° -> Probe bestanden; dann Hysterese verbunden <-> locker <-> lose, Kern nie
  const folge=[];
  STEUER.sig=A=>({psi:0.1*D2R, max:A.ab===1 ? STEUER.s1 : 1.0, min:0, ang:0, y:0.01}); STEUER.sigLose=true;
  STEUER.s1=0.04; G.karteRechnen(KZ);
  chk('Stufe (b): erstes sig von M6 nach dem Uebergang 4 cm, 0,1° -> Probe bestanden, bleibt verbunden', KZ.abschnitte[1].stufe==='verbunden' && KZ.lauf.probe[1]==null);
  for(const s of [0.07, 0.09, 0.06, 0.05, 0.10, 0.25, 0.16, 0.14]){ STEUER.s1=s; G.karteRechnen(KZ); folge.push(KZ.abschnitte[1].stufe); }
  chk('Stufen-Hysterese: 7 verbunden, 9 locker, 6 locker, 5 verbunden, 10 locker, 25 lose, 16 lose, 14 locker (cm)',
    folge.join(',')==='verbunden,locker,locker,verbunden,locker,lose,lose,locker', folge.join(','));
  chk('Kern bleibt verbunden, auch bei sig.max 1 m', KZ.abschnitte[0].stufe==='verbunden');
  STEUER.sig=A=>({psi:2*D2R, max:0.02, min:0, ang:0, y:0.01}); G.karteRechnen(KZ); G.karteRechnen(KZ);
  chk('locker -> verbunden braucht auch σψ <= 1° (2° bleibt locker)', KZ.abschnitte[1].stufe==='locker');
  chk('Gewicht w = abschnittGewicht (lose/lokal 0)', KZ.abschnitte.every(A=>A.w===((A.stufe==='verbunden' || A.stufe==='locker') ? 1 : 0)));
  // (b) Probe nicht bestanden: erstes sig von M6 7 cm > 5 cm -> locker (nicht verbunden); g danach nur von M6
  for(const [sP, psiDeg, soll] of [[0.07, 0.1, 'locker'], [0.03, 1.5, 'locker'], [0.05, 1.0, 'verbunden']]){
    attrappen({klasse:()=>({klasse:'reloc', sP:0.5, sY:5*D2R}), reg:()=>({hyp:[{g:hypG, kosten:1, nSeg:30, nRicht:2, nBilder:10}], gewaehlt:0, verhaeltnis:2, arbeit:{vorhersagen:300}}),
      sig:A=>({psi:(A.ab===1 ? psiDeg : 0.1)*D2R, max:A.ab===1 ? sP : 0.01, min:0, ang:0, y:0.01})});
    const K=neu(); speise(K, 0, 1.2, 0, zweiWaende); speise(K, 1.3, 2.5, 1, zweiWaende);
    G.karteRechnen(K); const s1=K.abschnitte[1].stufe, p1=K.lauf.probe[1]!=null, sig1=K.abschnitte[1].sig; G.karteRechnen(K); const s2=K.abschnitte[1].stufe;
    chk(`Stufe (b) Probe: Uebergang ohne sig (M6 rechnet den Abschnitt erst ab der naechsten Runde); erstes sig ${Math.round(100*sP)} cm / ${psiDeg}° -> ${soll}`,
      s1==='verbunden' && p1 && sig1==null && s2===soll && K.lauf.probe[1]==null, `${s1} -> ${s2}`); }
}

// ------------------------------------------------- Registrierung: Budget und Reihenfolge
{
  attrappen({klasse:()=>({klasse:'reloc', sP:0.5, sY:5*D2R}), reg:(ab)=>({hyp:[], gewaehlt:-1, verhaeltnis:1, arbeit:1500})});
  const KZ=neu(); speise(KZ, 0, 1.2, 0, zweiWaende); speise(KZ, 1.3, 1.6, 1, zweiWaende); speise(KZ, 1.7, 2.0, 2, zweiWaende); speise(KZ, 2.1, 2.4, 3, zweiWaende);
  G.karteRechnen(KZ);
  const r1=STEUER.regAufrufe.map(x=>`${x.ab}:${x.arbeit}`).join(',');
  STEUER.regAufrufe=[]; G.karteRechnen(KZ); const r2=STEUER.regAufrufe.map(x=>`${x.ab}:${x.arbeit}`).join(',');
  STEUER.regAufrufe=[]; G.karteRechnen(KZ); const r3=STEUER.regAufrufe.map(x=>`${x.ab}:${x.arbeit}`).join(',');
  chk('Registrierung: Budget arbeit.reg = 2000 Vorhersagen je Runde, nach ab, Rest geht an den naechsten', r1==='1:2000,2:500', r1);
  chk('Registrierung: in der Folgerunde weiter in fester Reihenfolge; ohne neue Schluessel-Beob nicht erneut', r2==='3:2000' && r3==='', `${r2} | ${r3}`);
  chk('RundeKopf.arbeit.reg = verbrauchte Vorhersagen', KZ.lauf.letzte.arbeit.reg===0 && STEUER.regAufrufe.length===0);
  // Verbrauch aus r.arbeit.vorhersagen (M4 gibt ein Objekt zurueck, 4); M4 schreibt A.reg selbst -> M10 zaehlt versuche nicht doppelt
  attrappen({klasse:()=>({klasse:'reloc', sP:0.5, sY:5*D2R}), reg:(ab, KZ2)=>{ const A=KZ2.abschnitte[ab]; A.reg={hyp:[], gewaehlt:-1, verhaeltnis:1, versuche:(A.reg && A.reg.versuche || 0)+1};
    return {hyp:[], gewaehlt:-1, verhaeltnis:1, arbeit:{vorhersagen:700, bilder:3, bilderA:1, kandidaten:4, plan:2, verfeinert:1}}; }});
  const KO=neu({regMin:0}); speise(KO, 0, 1.2, 0, zweiWaende); speise(KO, 1.3, 1.6, 1, zweiWaende); speise(KO, 1.7, 2.0, 2, zweiWaende); speise(KO, 2.1, 2.4, 3, zweiWaende);
  G.karteRechnen(KO); const o1=STEUER.regAufrufe.map(x=>`${x.ab}:${x.arbeit}`).join(',');
  chk('Registrierung: Verbrauch aus r.arbeit.vorhersagen (Objekt wie M4), RundeKopf.arbeit.reg = getane Vorhersagen; A.reg schreibt M4, versuche nicht doppelt',
    o1==='1:2000,2:1300,3:600' && KO.lauf.letzte.arbeit.reg===2000 && [1,2,3].every(ab=>KO.abschnitte[ab].reg.versuche===1), `${o1}, reg ${KO.lauf.letzte.arbeit.reg}`);
  const KM=neu({regMin:1000}); speise(KM, 0, 1.2, 0, zweiWaende); speise(KM, 1.3, 1.6, 1, zweiWaende); speise(KM, 1.7, 2.0, 2, zweiWaende); speise(KM, 2.1, 2.4, 3, zweiWaende);
  STEUER.regAufrufe=[]; G.karteRechnen(KM); const o2=STEUER.regAufrufe.map(x=>`${x.ab}:${x.arbeit}`).join(','); STEUER.regAufrufe=[]; G.karteRechnen(KM); const o3=STEUER.regAufrufe.map(x=>`${x.ab}:${x.arbeit}`).join(',');
  chk('Registrierung: jeder Aufruf zaehlt mindestens regMin = 1000 gegen das Budget (hoechstens 2 Aufrufe je Runde), der Rest folgt in der naechsten Runde',
    o2==='1:2000,2:1000' && KM.lauf.letzte.arbeit.reg===700 && o3==='3:2000', `${o2} | ${o3}`);
  // Globale Karte waechst: lokale/lose Abschnitte werden erneut registriert, reihum ab dem Zeiger (verbraucht ein Aufruf das ganze Budget,
  // kommen trotzdem alle dran); ohne Wachstum kein neuer Versuch
  attrappen({klasse:()=>({klasse:'reloc', sP:0.5, sY:5*D2R}), reg:()=>({hyp:[], gewaehlt:-1, verhaeltnis:1, arbeit:{vorhersagen:2000}})});
  const KW=neu(); speise(KW, 0, 1.2, 0, zweiWaende); speise(KW, 1.3, 1.6, 1, zweiWaende); speise(KW, 1.7, 2.0, 2, zweiWaende); speise(KW, 2.1, 2.4, 3, zweiWaende);
  const reihe=[]; for(let r=0;r<3;r++){ STEUER.regAufrufe=[]; G.karteRechnen(KW); reihe.push(STEUER.regAufrufe.map(x=>x.ab).join(',')); }
  STEUER.regAufrufe=[]; G.karteRechnen(KW); reihe.push(STEUER.regAufrufe.map(x=>x.ab).join(','));
  for(let r=0;r<4;r++){ KW.waende.set('g'+r, {id:'g'+r, rahmen:-1, phi:0, rho:5+r, cov:[1e-4, 0, 1e-4], h:'c', cls:'wand', zustand:'bestaetigt', beob:[], iv:[], abschnitte:[], ringe:[], insel:'nein', inselRunden:0, durchblick:[], teile:[]});
    STEUER.regAufrufe=[]; G.karteRechnen(KW); reihe.push(STEUER.regAufrufe.map(x=>x.ab).join(',')); }
  chk('Registrierung: erst 1, 2, 3 (je eine Runde, Budget aufgebraucht), dann Ruhe; waechst die globale Karte jede Runde, reihum 1, 2, 3, 1 (nicht immer 1)',
    reihe.join('|')==='1|2|3||1|2|3|1', reihe.join('|'));
  // laufender Abschnitt bekommt Schluessel-Beob: erneut erst ab +10 % (mindestens 1), nicht bei jeder neuen Beob
  { attrappen({klasse:()=>({klasse:'reloc', sP:0.5, sY:5*D2R}), reg:()=>({hyp:[], gewaehlt:-1, verhaeltnis:1, arbeit:{vorhersagen:100}})});
    const KL=neu(); speise(KL, 0, 1.2, 0, zweiWaende); speise(KL, 1.3, 1.6, 1, zweiWaende); G.karteRechnen(KL); let k=800, t=1.7;
    const mehr=n=>{ for(let i=0;i<n;i++){ G.kartePose(KL, pose(+t.toFixed(2), 1, t*0.2, 0)); G.karteBild(KL, bild(k++, +t.toFixed(2), 1, zweiWaende)); t+=0.1; }
      STEUER.regAufrufe=[]; G.karteRechnen(KL); return KL.abschnitte[1].nSchluessel+':'+STEUER.regAufrufe.length; };
    const z=[mehr(1), mehr(15), mehr(1), mehr(1)];
    chk('Registrierung: laufender Abschnitt erneut erst bei +10 % Schluessel-Beob (mindestens 1): 4 -> 5 ja, 20 -> 21 nein, -> 22 ja', z.join(',')==='5:1,20:1,21:0,22:1', z.join(',')); }
  const st=KW.lauf.regStand[1];
  chk('Registrierung: Stand je Abschnitt (Schluessel-Beob, Zahl der globalen nicht-kandidat Waende, verbundene Abschnitte)', st && st.nS===KW.abschnitte[1].nSchluessel && st.n>=2 && st.verb==='0', JSON.stringify(st));
}

// ------------------------------------------------- Inseln: W.insel mit 3 Runden Hysterese, Entscheid, Export (7.3, 7.4)
{
  const inselRing=(an, x={})=>({ringe:[ring('A', 'aussen', [[0,0],[4,0],[4,3],[0,3]], ['w0','w1','w2','w3']),
    ...(an ? [ring('I:w5', 'insel', [[1,1],[1,2],[2,2],[2,1]], ['w5', null, null, null], x)] : [])], kandidaten:[], hypothesen:[], aufgefuellt:0, verworfen:0, innenVerworfen:[], nLinien:5, nZellen:9, arbeit:{schnitte:1, zellen:9}, ms:0, warn:[]});
  const W5={wand:'w5', phi:Math.PI}, mk=()=>{ const KZ=neu(); speise(KZ, 0, 1.0, 0, [...zweiWaende, W5, {wand:'w2', phi:Math.PI/2}, {wand:'w3', phi:0}]); return KZ; };
  const muster=(pat)=>{ attrappen({umriss:KZ=>inselRing(pat[(KZ.runde-1)%pat.length])}); const KZ=mk(), z=[];
    for(let r=0;r<pat.length;r++){ G.karteRechnen(KZ); z.push(KZ.waende.get('w5').insel); } return z; };
  const a=muster([1,1,1,1,0,0,1,0,0,0,0]);
  chk('W.insel: 3 Runden in Folge auf einem Inselring zum Setzen, 3 Runden ohne zum Loesen', a.join(',')==='verdacht,verdacht,ja,ja,ja,ja,ja,ja,ja,nein,nein', a.join(','));
  const b=muster([1,0,1,0,1,0,1,0,1,0,1,0]);
  chk('W.insel: abwechselnd an/aus -> nie ja', b.every(x=>x!=='ja'), b.join(','));
  // 50 Runden, feste Eingaenge, Umriss flackert gegnerisch: hoechstens ein Wechsel je Wand (Kritik 37)
  const wechselIn=(pat)=>{ attrappen({umriss:KZ=>inselRing(pat[(KZ.runde-1)%pat.length])}); const KZ=mk(); let w=0, alt=false;
    for(let r=0;r<50;r++){ G.karteRechnen(KZ); const z=KZ.waende.get('w5').insel==='ja'; if(z!==alt) w++; alt=z; } return w; };
  const zuf=(p, maxLauf)=>{ const f=[]; let s=12345, k=0; for(let i=0;i<50;i++){ s=(s*1103515245+12345)%2147483648; let x=s%100<p ? 1 : 0; if(x && k>=maxLauf) x=0; k=x ? k+1 : 0; f.push(x); } return f; };
  const wF=wechselIn(zuf(60, 2)), wK=wechselIn([...zuf(50, 2).slice(0, 20), ...Array(30).fill(1)]), wG=wechselIn(zuf(40, 99));
  chk('50 Runden, feste Eingaenge, Inselring flackert mit an-Laeufen <= 2 Runden: W.insel wechselt nie; flackernd und dann stabil: genau ein Wechsel', wF===0 && wK===1, `${wF} / ${wK} Wechsel`);
  out.push(`info Gegnerisches Flackern (40 % an, Laeufe bis 3+ Runden) schlaegt die 3-Runden-Hysterese: ${wG} Wechsel in 50 Runden - die Schranke 10.9 braucht ein M7, das bei festen Eingaengen nicht mit Periode >= 6 Runden schwingt`);
  // iv[].ring und W.ringe: Kante k laeuft von Ecke k nach Ecke k+1
  attrappen({umriss:()=>inselRing(true)}); const KZ2=mk(); KZ2.waende; G.karteRechnen(KZ2);
  const w5=KZ2.waende.get('w5'); w5.iv=[{s0:-1.9, s1:-1.1, ring:-1}]; G.karteRechnen(KZ2);
  chk('W.ringe und iv[].ring aus dem Umriss (Ring-Index), Kante k = Ecke k -> k+1', JSON.stringify(w5.ringe)==='[1]' && w5.iv[0].ring===1 && JSON.stringify(KZ2.waende.get('w0').ringe)==='[0]',
    `${JSON.stringify(w5.ringe)} ring ${w5.iv[0].ring}`);
  // Entscheid und Export nach 7.3
  attrappen({umriss:()=>inselRing(true, {teil:true, supRing:0.6})}); const KZ3=mk(); const r0=G.karteRechnen(KZ3).stand;
  chk('teil-Insel ohne Entscheid: entscheid offen, nicht exportiert; Abschluss gesperrt (insel-offen)', r0.ringe[1].entscheid==='offen' && r0.ringe[1].exportiert===false && r0.abschluss.fehlt.includes('insel-offen'));
  G.karteEntscheid(KZ3, {ring:'I:w5', wahl:'ja', t:1}); const r1=G.karteRechnen(KZ3).stand;
  chk('karteEntscheid ja -> nutzer-ja, exportiert', r1.ringe[1].entscheid==='nutzer-ja' && r1.ringe[1].exportiert===true && !r1.abschluss.fehlt.includes('insel-offen'));
  G.karteEreignis(KZ3, {typ:'insel-entscheid', ring:'I:w5', wahl:'schrank', t:1.1}); const r2=G.karteRechnen(KZ3).stand;
  chk('Ereignis insel-entscheid schrank -> entscheid schrank, nicht exportiert', r2.ringe[1].entscheid==='schrank' && r2.ringe[1].exportiert===false);
  attrappen({umriss:()=>inselRing(true, {teil:false, supRing:0.9})}); const r3=G.karteRechnen(mk()).stand;
  chk('volle Insel ohne Entscheid: auto, exportiert; Aussenring auto', r3.ringe[1].entscheid==='auto' && r3.ringe[1].exportiert && r3.ringe[0].entscheid==='auto');
  G.karteEntscheid(KZjetzt, {ring:'I:w5', wahl:'nein', t:2}); const r4=G.karteRechnen(KZjetzt).stand;
  chk('Verwerfen auch einer vollen Insel -> nutzer-nein, nicht exportiert', r4.ringe[1].entscheid==='nutzer-nein' && !r4.ringe[1].exportiert);
}

// ------------------------------------------------- Hypothesen (7.2, 7.3): Stufe von M7, nur voll in den Schnitt, teil als offener Ring
{
  const H={id:'Iab', quelle:'gegen', linien:['a','b'], ecken:[], poly:[[1,1],[1.4,1],[1.4,1.4],[1,1.4]], A:0.16, U:1.6, dicke:0.4};
  // Attrappe wie M7 (inselBewerten): Runden aus o.vorher fortgezaehlt, kandidat bis hypRunden, dann teil bzw. voll; Ring nicht aufzaehlbar
  const bewM7=(h, o, voll)=>{ const v=o.vorher, r=(v && v.stufe!=='nein' ? v.runden : 0)+1, sup=voll ? 0.9 : 0.6;
    const b={id:h.id, dE:0.1, dEn:0.1, phi:0.2, pfad:false, supRing:sup, seiten:2, stufe:r>=3 ? (voll ? 'voll' : 'teil') : 'kandidat', runden:r};
    Object.defineProperty(b, 'ring', {value:ring(h.id, 'insel', h.poly, [null, null, null, null], {teil:!voll, supRing:sup, quelle:'hypothese', entscheid:'offen', exportiert:false}), enumerable:false});
    return b; };
  // Attrappe wie M7 (umriss): inselFest wird als Insel ausgeschnitten (entscheid nutzer-ja), Hypothesen in inselFest entfallen
  const umrissFest=(KZ, inp)=>quadrat({ringe:[ring('A', 'aussen', [[0,0],[4,0],[4,3],[0,3]], ['w0','w1','w2','w3']),
    ...(inp.inselFest||[]).map(f=>ring(f.id, 'insel', f.poly, [null, null, null, null], {teil:false, supRing:0.9, entscheid:'nutzer-ja'}))]});
  const hypOhneFest=inp=>[H, {...H, id:'Icd'}].filter(h=>!(inp.inselFest||[]).some(f=>f.id===h.id));
  const vorherOk=[];
  const runde=KZ=>{ const v=KZ.umriss; STEUER.umrissAufrufe=[]; const r=G.karteRechnen(KZ); vorherOk.push(STEUER.umrissAufrufe.length>0 && STEUER.umrissAufrufe.every(x=>x.vorher===v)); return r; };
  attrappen({hyp:hypOhneFest, bew:(h, o)=>bewM7(h, o, false), umriss:umrissFest});
  const KZ=neu({arbeit:{hyp:1}}); speise(KZ, 0, 1.0, 0, zweiWaende); const st=[];
  for(let r=0;r<4;r++){ const s=runde(KZ).stand; st.push((s.hypothesen[0]||{}).stufe+'/'+(s.hypothesen[0]||{}).runden); }
  chk('Hypothese: Stufe und Runden kommen von G.inselBewerten (M7), vorige Bewertung je id als o.vorher; M10 zaehlt nicht selbst', st.join(',')==='kandidat/1,kandidat/2,teil/3,teil/4', st.join(','));
  const R=KZ.umriss.ringe.find(x=>x.id==='Iab');
  chk('teil: KEIN zweiter Schnitt mit inselFest (7.3), sondern offener Ring (teil, entscheid offen, nicht exportiert); hoechstens arbeit.hyp Bewertungen je Runde, nach id',
    !LOG.includes('umriss:fest') && R && R.teil && R.entscheid==='offen' && R.exportiert===false && R.quelle==='hypothese' && KZ.lauf.letzte.arbeit.hyp===1
    && KZ.umriss.hypothesen.length===1 && KZ.umriss.hypothesen[0].id==='Iab', R ? `${R.entscheid} ${R.exportiert}` : 'kein Ring');
  const r5=runde(KZ).stand;
  chk('Hinweis insel-erkannt fuer eine teil-Hypothese (14.2); offene teil-Insel sperrt den Abschluss', r5.hinweise.some(h=>h.code==='insel-erkannt' && h.ring==='Iab') && r5.abschluss.fehlt.includes('insel-offen'));
  G.karteEntscheid(KZ, {ring:'Iab', wahl:'ja', t:1}); const r6=runde(KZ).stand, R6=r6.ringe.filter(x=>x.id==='Iab');
  chk('Nutzer uebernimmt die teil-Insel: inselFest ueber umrissEingabe (Lage aus dem Ring der vorigen Runde), Ring nutzer-ja, exportiert, genau einmal',
    LOG.includes('umriss:fest') && R6.length===1 && R6[0].entscheid==='nutzer-ja' && R6[0].exportiert===true && !r6.abschluss.fehlt.includes('insel-offen'), R6.map(x=>x.entscheid).join(','));
  attrappen({hyp:hypOhneFest, bew:(h, o)=>bewM7(h, o, true), umriss:umrissFest});
  const KV=neu({arbeit:{hyp:1}}); speise(KV, 0, 1.0, 0, zweiWaende); for(let r=0;r<3;r++) runde(KV);
  const RV=KV.umriss.ringe.find(x=>x.id==='Iab');
  chk('voll: zweiter Schnitt mit inselFest, Ring aus dem Schnitt, ohne Entscheid auto und exportiert', LOG.includes('umriss:fest') && RV && RV.entscheid==='auto' && RV.exportiert===true && !RV.teil);
  chk('G.umriss bekommt in jeder Runde vorher = Umriss der vorigen Runde, auch beim zweiten Schnitt (Hysterese Weg a, 7.2)', vorherOk.every(Boolean) && vorherOk.length===9, vorherOk.map(x=>x ? 1 : 0).join(''));
}

// ------------------------------------------------- Weg (a) mit echtem M7: phi-Tor mit Hysterese ueber vorher (Befund 3)
{
  // Fixture wie test/karte-umriss.mjs: Raum 6 x 5 m, Pfeiler 0,40 x 0,37 m rundum gesehen
  const P0=[2.3,2.3], P1=[2.7,2.67];
  const AUSSEN=[{id:'S0', n:[1,0], d:0, a:[0,0], b:[0,5]}, {id:'S1', n:[-1,0], d:-6, a:[6,0], b:[6,5]}, {id:'S2', n:[0,1], d:0, a:[0,0], b:[6,0]}, {id:'S3', n:[0,-1], d:-5, a:[0,5], b:[6,5]}];
  const FAC=[{id:'PS', n:[0,-1], d:-P0[1], a:[P0[0],P0[1]], b:[P1[0],P0[1]]}, {id:'PW', n:[-1,0], d:-P0[0], a:[P0[0],P0[1]], b:[P0[0],P1[1]]},
             {id:'PN', n:[0,1], d:P1[1], a:[P0[0],P1[1]], b:[P1[0],P1[1]]}, {id:'PE', n:[1,0], d:P1[0], a:[P1[0],P0[1]], b:[P1[0],P1[1]]}];
  const tOf=(l,p)=>-l.n[1]*p[0]+l.n[0]*p[1], imPf=p=>p[0]>P0[0] && p[0]<P1[0] && p[1]>P0[1] && p[1]<P1[1];
  const linie=w=>{ const t0=tOf(w,w.a), t1=tOf(w,w.b); return {id:w.id, n:w.n, d:w.d, iv:[[Math.min(t0,t1), Math.max(t0,t1)]], side:1, w:1, sd:0.005, sth:0.002, hOk:true, kind:'decke', kap:[1], wAb:1, vert:[], durchblick:[]}; };
  const trifft=(a,b)=>{ for(let k=1;k<40;k++){ const t=k/40; if(imPf([a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])])) return true; } return false; };
  const cams=[]; for(let x=0.6;x<=2.0;x+=0.35) for(let y=0.6;y<=2.0;y+=0.35) cams.push([x,y]);
  for(let x=0.6;x<=5.4;x+=0.6) for(const y of [0.6,4.4]) cams.push([x,y]); for(let y=0.6;y<=4.4;y+=0.6) for(const x of [0.6,5.4]) cams.push([x,y]);
  const fans=[]; for(const c of cams) for(const w of [...AUSSEN, ...FAC]) for(let i=0;i<20;i++){ const a=[w.a[0]+(w.b[0]-w.a[0])*i/20, w.a[1]+(w.b[1]-w.a[1])*i/20], b=[w.a[0]+(w.b[0]-w.a[0])*(i+1)/20, w.a[1]+(w.b[1]-w.a[1])*(i+1)/20];
    const m=[(a[0]+b[0])/2, (a[1]+b[1])/2]; if(w.n[0]*c[0]+w.n[1]*c[1]-w.d<=0.1 || trifft(c, m)) continue; fans.push({c, a, b, line:w.id, ab:0, w:1}); }
  const raum={lines:[...AUSSEN, ...FAC].map(linie), fans, path:cams.map(p=>({p, w:1})), bodenFrei:null, wBoden:0, inselFest:[], ausschluss:[]};
  const echt=(ohneVorher)=>{ attrappen({}); new Function('G', '"use strict";\n'+read('raumskizze-umriss.js'))(G);
    const um=G.umriss; if(ohneVorher) G.umriss=(inp, opt)=>um(inp, {...opt, vorher:null});
    G.umrissEingabe=(KZ)=>({...raum, inselFest:[], ausschluss:[]});
    return um; };
  const um=echt(false), e0=um(raum, {...G.UM_DEF}), phi0=e0.ringe.filter(r=>r.art==='insel').map(r=>r.phi)[0];
  const lauf=(ohneVorher)=>{ echt(ohneVorher); const KZ=neu(); speise(KZ, 0, 1.0, 0, zweiWaende); G.karteRechnen(KZ);
    for(const w of [...AUSSEN, ...FAC]) KZ.waende.set(w.id, {id:w.id, rahmen:-1, phi:Math.atan2(w.n[1], w.n[0]), rho:w.d, cov:[1e-6, 0, 1e-6], h:'c', cls:'wand', zustand:'bestaetigt',
      beob:[], iv:[], abschnitte:[0], ringe:[], insel:'nein', inselRunden:0, durchblick:[], teile:[], nSchluessel:0});
    // phi flackert um das Tor: 3 Runden knapp unter setzen (A), 4 Runden zwischen setzen und loesen (B)
    let w=0, alt=KZ.waende.get('PS').insel; const an=[];
    for(let r=0;r<50;r++){ const A=r%7<3; KZ.opt.umrissOpt=A ? {inselPhiSetzen:phi0+0.02, inselPhiLoesen:phi0+0.10} : {inselPhiSetzen:phi0-0.02, inselPhiLoesen:phi0+0.10};
      G.karteRechnen(KZ); const z=KZ.waende.get('PS').insel; if((z==='ja')!==(alt==='ja')) w++; alt=z; an.push(KZ.umriss.ringe.some(R=>R.art==='insel') ? 1 : 0); }
    return {w, an:an.join('')}; };
  const mit=lauf(false), ohne=lauf(true);
  chk(`Weg (a), echtes M7, phi ${Number.isFinite(phi0) ? phi0.toFixed(2) : phi0} flackert um das Tor (setzen/loesen): mit vorher bleibt die Insel, W.insel wechselt in 50 Runden genau einmal`,
    Number.isFinite(phi0) && mit.w===1 && /^1+$/.test(mit.an), `mit vorher ${mit.w} Wechsel (${mit.an.slice(0, 14)}…), ohne vorher ${ohne.w} Wechsel (${ohne.an.slice(0, 14)}…)`);
  chk('Gegenprobe: ohne vorher (alter Stand von M10) flackert die Insel mit und W.insel wechselt mehrfach', ohne.w>=2 && /0/.test(ohne.an), `${ohne.w} Wechsel`);
}

// ------------------------------------------------- Unterzug: entscheidet M5 mit Hysterese, M10 schreibt cls nicht aus lmDurchblick (Befund 1)
{
  // Attrappe wie M5 (lmHoehenklasse, 8.3, 6.5): roh 'unterzug' bei Durchblick, sonst 'wand'; Wechsel erst nach 2 Aufrufen in Folge; zustand dazu
  const klasseM5=W=>{ const roh=(W.durchblick||[]).length ? 'unterzug' : 'wand';
    if(roh===W.cls) W.clsZaehler=0; else if(++W.clsZaehler>=2){ W.cls=roh; W.clsZaehler=0; }
    W.zustand=W.cls==='wand' ? 'bestaetigt' : 'kandidat'; return W.cls; };
  attrappen({klasseW:klasseM5, durchblick:W=>W.id==='w0' && STEUER.db ? {durchblick:[[0, 1]], unterzug:true} : {durchblick:[], unterzug:false}});
  const KZ=neu(); speise(KZ, 0, 1.0, 0, zweiWaende); G.karteRechnen(KZ); KZ.waende.get('w0').clsZaehler=0;
  const z=[]; let k=500;
  for(let r=0;r<9;r++){ STEUER.db=r>=1 && r<=4; speise(KZ, +(1.1+0.1*r).toFixed(2), +(1.1+0.1*r).toFixed(2), 0, zweiWaende, 0.1, k++); STEUER.klasseIds=[]; G.karteRechnen(KZ);
    z.push(KZ.waende.get('w0').cls+(STEUER.klasseIds.includes('w0') ? '' : '!')); }
  chk('vorübergehender Durchblick: M10 setzt nicht sofort unterzug, lmHoehenklasse laeuft auch fuer unterzug-Waende; nach dem Durchblick wieder wand (bestaetigt)',
    z.join(',')==='wand,wand,unterzug,unterzug,unterzug,unterzug,wand,wand,wand' && KZ.waende.get('w0').zustand==='bestaetigt', z.join(','));
}

// ------------------------------------------------- Schritt 7 mit Arbeitsbudget (Befund 6)
{
  const sechs=[0,1,2,3,4,5].map(i=>({wand:'w'+i, phi:(i%2)*Math.PI/2, rho:1+i}));
  attrappen({}); const KZ=neu(); speise(KZ, 0, 1.0, 0, sechs); G.karteRechnen(KZ);
  const ids=()=>{ const x=[...new Set(STEUER.klasseIds||[])].sort(); STEUER.klasseIds=[]; return x.join(','); }; ids();
  G.karteRechnen(KZ); const r0=ids(), lm0=KZ.lauf.letzte.arbeit.lm;
  speise(KZ, 1.1, 1.1, 0, [sechs[2]], 0.1, 600); G.karteRechnen(KZ); const r1=ids(), lm1=KZ.lauf.letzte.arbeit.lm;
  chk('Schritt 7: ohne neuen Eingang keine Aufrufe (arbeit.lm 0); neue Beob einer Wand -> nur diese Wand', r0==='' && lm0===0 && r1==='w2' && lm1===1, `${r0 || '-'} (${lm0}) | ${r1} (${lm1})`);
  KZ.opt.arbeit.lm=2; KZ.hC+=0.01; const folge=[]; for(let r=0;r<4;r++){ G.karteRechnen(KZ); folge.push(ids()); }
  chk('Schritt 7: hC um 1 cm -> alle Waende neu, je Runde hoechstens arbeit.lm = 2, reihum ab dem Zeiger (nach w2)', folge.join('|')==='w3,w4|w0,w5|w1,w2|', folge.join('|'));
  KZ.opt.arbeit.lm=100; KZ.opt.lmAlle=3; const alle=[]; for(let r=0;r<4;r++){ G.karteRechnen(KZ); alle.push(ids()); }
  chk('Schritt 7: jede Wand spaetestens nach lmAlle Runden (hier 3) ohne Besuch, danach wieder Ruhe', alle.join('|')==='w0,w3,w4,w5|w1,w2||w0,w3,w4,w5', alle.join('|'));
  KZ.opt.lmAlle=20; KZ.waende.get('w4').clsZaehler=1; STEUER.klasseW=W=>{ W.clsZaehler=0; return W.cls; }; G.karteRechnen(KZ); const offen=ids();
  G.karteRechnen(KZ, {schluss:true}); const schluss=ids();
  chk('Schritt 7: offene Hysterese (clsZaehler > 0) wird gerechnet; Schlussrunde rechnet alle Waende', offen==='w4' && schluss==='w0,w1,w2,w3,w4,w5', `${offen} | ${schluss}`);
}

// ------------------------------------------------- Wand-ids als Zeichenkette (Kern-Regel, mitWand)
{
  attrappen(); const KZ=neu(); for(let i=0;i<10;i++){ G.kartePose(KZ, pose(i*0.1, 0, 0, 0)); G.karteBild(KZ, bild(i, i*0.1, 0, [{wand:'T3', phi:0}, {wand:'h7', phi:Math.PI/2}])); }
  G.karteRechnen(KZ);
  chk('Wand-ids als Zeichenkette: Kern-Regel und mitWand zaehlen sie (Beob.L ist id oder -1)', KZ.kern===0 && KZ.abschnitte[0].mitWand===true && KZ.abschnitte[0].richtungen===2);
}

// ------------------------------------------------- Umriss nur jede umrissJede. Runde, Schlussrunde immer
{
  attrappen(); const KZ=G.karteNeu({umrissJede:2}); KZjetzt=KZ; speise(KZ, 0, 1.0, 0, zweiWaende); const n=[];
  for(let r=0;r<5;r++){ LOG=[]; G.karteRechnen(KZ); n.push(LOG.includes('umriss') ? 1 : 0); }
  LOG=[]; G.karteRechnen(KZ, {schluss:true});
  chk('Umriss hoechstens jede 2. Runde (live und offline gleich), Schlussrunde immer', n.join('')==='01010' && LOG.includes('umriss'), n.join(''));
}

// ------------------------------------------------- Folgekanten (5a): Ereignis rest einmal je Kante
{
  const kn=A=>A.ab===0 ? {t:Float64Array.from([0, 1.0, 2.0]), s:Float64Array.from([0, 0.2, 0.4]), d:new Float64Array(12), cov:null} : A.knoten;
  let chi=[20];
  attrappen({knoten:kn, rest:KZ=>{ const c=chi[(KZ.runde-1)%chi.length]; return c ? [{ab:0, j:1, chi2:c}] : []; }});
  const KZ=neu({knoten:true});
  for(let i=0;i<=25;i++){ const t=i*0.1, p=pose(+t.toFixed(2), 0, t*0.2, i>=15 ? 0.3+0.05*(i-15) : 0); G.kartePose(KZ, p); G.karteBild(KZ, bild(i, +t.toFixed(2), 0, zweiWaende)); }
  const ev=()=>KZ.lauf.ereignisse.filter(e=>e.typ==='rest');
  G.karteRechnen(KZ); const n1=ev().length; G.karteRechnen(KZ); const n2=ev().length;
  chk('5a: χ² 20 > 16 in 1 Runde -> noch kein Ereignis; in 2 Runden in Folge -> Ereignis rest', n1===0 && n2===1, `${n1}, ${n2}`);
  chk('5a: Zeit des Ereignisses = Zeile mit dem groessten Pose-Rest im Kantenintervall', ev()[0] && Math.abs(ev()[0].t-1.5)<1e-9, ev()[0] && ev()[0].t);
  G.kartePose(KZ, pose(2.6, 0, 0.52, 0)); G.karteRechnen(KZ);
  chk('5a: Schnitt art rest in G.sessionCuts, Abschnitt dahinter erbt die Stufe; g0 = gBei(A, t)', KZ.schnitte.some(s=>s.art==='rest') && KZ.abschnitte.length===2 && KZ.abschnitte[1].stufe==='verbunden'
    && KZ.abschnitte[1].g0 && KZ.lauf.umgegliedert>=1, KZ.abschnitte.map(a=>a.stufe).join(','));
  chk('Neugliederung: Beob.ab und Bild-ab ueber sectionOf, Kern bleibt 0', KZ.beob.every(b=>b.ab===sectionOf(KZ.schnitte, b.t, b.ep)) && [...KZ.bilder.values()].every(b=>b.ab===sectionOf(KZ.schnitte, b.t, b.ep)) && KZ.kern===0);
  for(let r=0;r<50;r++) G.karteRechnen(KZ);
  chk('50 Runden mit festen Eingaengen und anhaltendem χ² > 16: hoechstens ein Schnitt rest je Kante', ev().length===1 && KZ.schnitte.filter(s=>s.art==='rest').length===1, `${ev().length} Ereignisse`);
  chi=[20, 5]; attrappen({knoten:kn, rest:KZ=>{ const c=chi[(KZ.runde-1)%chi.length]; return c ? [{ab:0, j:1, chi2:c}] : []; }}); const KZ2=neu({knoten:true});
  for(let i=0;i<=25;i++){ const t=i*0.1; G.kartePose(KZ2, pose(+t.toFixed(2), 0, t*0.2, 0)); G.karteBild(KZ2, bild(i, +t.toFixed(2), 0, zweiWaende)); }
  for(let r=0;r<20;r++) G.karteRechnen(KZ2);
  chk('5a: χ² abwechselnd 20 / 5 (nie 2 Runden in Folge) -> kein Ereignis', !KZ2.lauf.ereignisse.some(e=>e.typ==='rest'));
  attrappen({knoten:kn, rest:()=>[{ab:0, j:1, chi2:99}]}); const KZ3=neu({knoten:false}); speise(KZ3, 0, 2.5, 0, zweiWaende); for(let r=0;r<5;r++) G.karteRechnen(KZ3);
  chk('ohne knoten: kein knotenSetzen, kein Folgekanten-Test', !LOG.some(x=>x.startsWith('knotenSetzen')) && !KZ3.lauf.ereignisse.some(e=>e.typ==='rest') && STEUER.ausgleichOpt.every(o=>o.knoten===false));
}

// ------------------------------------------------- Strukturwechsel und lago (5.4, RundeKopf.lago)
{
  attrappen({klasse:()=>({klasse:'nurT', sP:0.01, sY:0.2*D2R})});
  const KZ=neu({lago:'auto'}); speise(KZ, 0, 1.0, 0, zweiWaende); const g=[];
  const R=()=>{ const r=G.karteRechnen(KZ); g.push(r.kopf.lago ? r.kopf.lago.grund : '-'); };
  R(); R(); speise(KZ, 1.1, 1.5, 1, zweiWaende); R(); R(); KZ.schnitte[0].bindung.k='sprung'; R(); R(); G.karteRechnen; const s=G.karteRechnen(KZ, {schluss:true}); g.push(s.kopf.lago ? s.kopf.lago.grund : '-');
  chk('lago auto: Stufe 1/2 nur bei Strukturwechsel (kern, verbunden, mm) und in der Schlussrunde, Grund in RundeKopf.lago', g.join(',')==='kern,-,-,verbunden,mm,-,schluss', g.join(','));
  chk('lago auto: an lmAusgleich geht lago immer bei Wechsel, sonst aus; strukturwechsel mit Grund', STEUER.ausgleichOpt.filter(o=>o.nurAb==null).map(o=>o.lago[0]).join('')==='iaaiiai', STEUER.ausgleichOpt.filter(o=>o.nurAb==null).map(o=>o.lago).join(','));
  attrappen(); const KZ2=neu({lago:'aus'}); speise(KZ2, 0, 1.0, 0, zweiWaende); const h=[]; for(let r=0;r<3;r++) h.push(G.karteRechnen(KZ2).kopf.lago); h.push(G.karteRechnen(KZ2, {schluss:true}).kopf.lago);
  chk('lago aus (Vorgabe): RundeKopf.lago immer null, lmAusgleich lago aus', h.every(x=>x===null) && STEUER.ausgleichOpt.every(o=>o.lago==='aus'));
}

// ------------------------------------------------- Ausfall (5.2): Ausnahme und stummes Modul
{
  let wirf=true; attrappen({ausgleich:(KZ, o)=>{ if(o.nurAb==null && wirf) throw new Error('Platzhalter wirft'); return 'weiter'; }});
  const KZ=neu(); speise(KZ, 0, 1.0, 0, zweiWaende);
  let r1=null, warf=false; try{ r1=G.karteRechnen(KZ); }catch(e){ warf=true; }
  chk('Ausnahme in einem Modul: karteRechnen wirft nicht, stand.fehler traegt die Meldung, RundeKopf mit kopf', !warf && r1 && /Platzhalter wirft/.test(r1.stand.fehler) && r1.kopf && r1.kopf.kopf, r1 && r1.stand.fehler);
  wirf=false; const r2=G.karteRechnen(KZ);
  chk('naechste Runde rechnet weiter (fehler null, Umriss da)', r2.stand.fehler===null && r2.stand.ringe.length===1 && r2.kopf.runde===r1.kopf.runde+1);
  attrappen({ausgleich:(KZ, o)=>o.nurAb==null ? undefined : 'weiter', umriss:()=>undefined}); const KZ2=neu(); speise(KZ2, 0, 1.0, 0, zweiWaende);
  let r3=null; warf=false; try{ r3=G.karteRechnen(KZ2); }catch(e){ warf=true; }
  chk('stummes Modul (lmAusgleich, umriss liefern undefined): kein Absturz, stand.fehler nennt sie', !warf && r3 && /lmAusgleich/.test(r3.stand.fehler) && /umriss/.test(r3.stand.fehler), r3 && r3.stand.fehler);
  attrappen(); const auf=G.lmAufnehmen; G.lmAufnehmen=(K,b,o)=>{ if(b.k===3) throw new Error('Aufnehmen wirft'); return auf(K,b,o); };
  const KZ5=neu(); let wf=false, rb=null; try{ for(let i=0;i<6;i++){ G.kartePose(KZ5, pose(i*0.1, 0, 0, 0)); const x=G.karteBild(KZ5, bild(i, i*0.1, 0, zweiWaende)); if(i===3) rb=x; } }catch(e){ wf=true; }
  const r5=G.karteRechnen(KZ5), r6=G.karteRechnen(KZ5);
  chk('Ausnahme beim Aufnehmen (karteBild): nicht toedlich, Bild zaehlt als verarbeitet, fehler im naechsten Stand, danach weg', !wf && rb && rb.wartet===false
    && /Eingang: Aufnehmen wirft \(1×\)/.test(r5.stand.fehler) && r6.stand.fehler===null && KZ5.lauf.kBis===5, r5.stand.fehler);
  attrappen(); const KZ2b=neu(); speise(KZ2b, 0, 1.0, 0, zweiWaende); G.lmAusgleich=(KZ,o)=>o.nurAb==null ? undefined : {ok:true}; G.umriss=()=>undefined; G.karteRechnen(KZ2b);
  delete G.lmAusgleich; let r4=null; warf=false; try{ r4=G.karteRechnen(KZ2b); }catch(e){ warf=true; }
  chk('fehlendes Modul (G.lmAusgleich nicht da): Meldung „Modul fehlt“ statt Absturz', !warf && /Modul fehlt: G\.lmAusgleich/.test(r4.stand.fehler), r4 && r4.stand.fehler);
}

// ------------------------------------------------- Abschluss (8.5, live 3.8)
{
  const st=(x={})=>({t:20, ringe:[ring('A', 'aussen', [[0,0],[4,0],[4,3],[0,3]], ['w0','w1','w2','w3'])], waende:['w0','w1','w2','w3'].map((id,k)=>({id, phi:[Math.PI/2, Math.PI, 3*Math.PI/2, 0][k],
    rho:[0, -4, -3, 0][k], cov:[1e-6, 0, 1e-6]})), ecken:[], hypothesen:[], abschnitte:[{ab:0, stufe:'verbunden', mitWand:true}], ...x});
  const v=(n, dt=1, topo='a4')=>({t:20, topo:Array.from({length:n}, (_,i)=>({t:20-(n-1-i)*dt, topo})), loseSeit:{}});
  const A=G.karteAbschluss(st(), v(4));
  chk('Abschluss bereit: Aussenring einfach, Abschnitte verbunden, Ecken σ <= 5 cm, keine offene Insel, Topologie 4 Staende ueber 3 s', A.bereit && !A.fehlt.length, A.fehlt.join(','));
  chk('Abschluss: Topologie erst 3 Staende / 2 s gleich -> stabil fehlt', G.karteAbschluss(st(), v(3)).fehlt.includes('stabil') && G.karteAbschluss(st(), v(7, 0.5)).bereit);
  chk('Abschluss: Kreuzender Aussenring -> aussenring fehlt', G.karteAbschluss(st({ringe:[ring('A','aussen',[[0,0],[4,3],[4,0],[0,3]],['w0','w1','w2','w3'])]}), v(4)).fehlt.includes('aussenring'));
  const sB=st({abschnitte:[{ab:0, stufe:'verbunden', mitWand:true}, {ab:1, stufe:'lose', mitWand:true}, {ab:2, stufe:'lokal', mitWand:false}]});
  chk('Abschluss: loser Abschnitt mit Wand sperrt bis 10 s, danach erledigt; ohne Wand zaehlt nicht; ausgeschlossen nennt ihn',
    G.karteAbschluss(sB, {...v(4), loseSeit:{1:15}}).fehlt.some(f=>f.startsWith('abschnitte')) && G.karteAbschluss(sB, {...v(4), loseSeit:{1:9}}).bereit
    && JSON.stringify(G.karteAbschluss(sB, {...v(4), loseSeit:{1:9}}).ausgeschlossen)==='[1]');
  const sE=st(); sE.waende[0].cov=[1e-2, 0, 1e-2];
  chk('Abschluss: Ecke mit σ > 5 cm sperrt, eine Senkrechte (Ecke senk) bestaetigt sie', G.karteAbschluss(sE, v(4)).fehlt.some(f=>f.startsWith('ecken'))
    && G.karteAbschluss({...sE, ecken:[{id:1, p:[0,0], senk:true}, {id:2, p:[4,0], senk:true}]}, v(4)).bereit);
  chk('Abschluss: ohne Verlauf (nur ein RundeKopf) nie bereit (stabil fehlt)', G.karteAbschluss(st(), {runde:3}).fehlt.includes('stabil'));
}

// ------------------------------------------------- Ereignisse, Erfassung, Pause, Schrank, Rueckgaengig, Ebenen
{
  attrappen(); const KZ=neu({quelle:'erfassungen', proj:PROJ});
  G.kartePose(KZ, pose(0, 0, 0, 0)); G.karteBild(KZ, bild(1, 0, 0, zweiWaende));
  const ra={o:[0.1, 1.5, 0.2], d:[0.6, 0.6, 0.53]}, rb={o:[0.1, 1.5, 0.2], d:[0.7, 0.55, 0.45]};
  const r=G.karteErfassung(KZ, {t:0.05, ep:0, ra, rb, id:7}), b=STEUER.aufgenommen ? STEUER.aufgenommen[0] : null;
  chk('quelle erfassungen: Bilder nicht aufgenommen, Erfassung als BildErgebnis mit 1 Segment (O), Strahlen ra/rb, nutzer', !LOG.includes('lmAufnehmen') && LOG.includes('lmAufnehmen:nutzer')
    && b && b.n===1 && b.cls[0]===KL.O && b.erfassung.nutzer===true && b.erfassung.id===7 && Math.abs(b.dir[0]-0.6)<1e-6 && Math.abs(b.dir[5]-0.45)<1e-6 && b.camTo[12]===0.1 && Math.abs(b.f-G.fokusPx(PROJ, 640))<1e-9);
  { attrappen(); const KE=neu({quelle:'erfassungen', proj:PROJ}), seen=[]; G.kartePose(KE, pose(0, 0, 0, 0));
    G.lmErfassung=(K, bi, o)=>{ seen.push({k:bi.k, id:bi.erfassung.id, nutzer:o.nutzer, ab:o.ab}); return {zugeordnet:1, neu:0}; };
    const re=G.karteErfassung(KE, {t:0.05, ep:0, ra, rb, id:9}); delete G.lmErfassung;
    chk('Erfassung: gibt es G.lmErfassung (Vorschlag fuer 4, M5), geht sie dorthin statt an lmAufnehmen', seen.length===1 && seen[0].id===9 && seen[0].nutzer===true && seen[0].ab===0
      && re.zugeordnet===1 && !LOG.some(x=>x.startsWith('lmAufnehmen')), JSON.stringify(seen)); }
  attrappen(); const KZ2=neu({quelle:'segmente'}); G.kartePose(KZ2, pose(0, 0, 0, 0)); G.karteErfassung(KZ2, {t:0, ep:0, ra, rb, id:1});
  chk('quelle segmente: Erfassungen gehen nicht in die Karte', !LOG.length || !LOG.some(x=>x.startsWith('lmAufnehmen')));
  attrappen(); const KZ3=neu(); G.kartePose(KZ3, pose(0, 0, 0, 0)); G.karteEreignis(KZ3, {typ:'pause', t:0}); G.karteBild(KZ3, bild(1, 0, 0, zweiWaende));
  G.karteEreignis(KZ3, {typ:'weiter', t:0}); G.karteBild(KZ3, bild(2, 0, 0, zweiWaende));
  chk('pause/weiter: waehrend Pause keine Aufnahme', LOG.filter(x=>x==='lmAufnehmen').length===1 && KZ3.bilder.has(1) && KZ3.bilder.has(2));
  speise(KZ3, 0.1, 2.0, 0, zweiWaende, 0.1, 10); const nVor=KZ3.beob.length; G.karteEreignis(KZ3, {typ:'rueckgaengig', t:2.0});
  chk('rueckgaengig: Beob der letzten 2 s weg (auch aus Wand.beob)', KZ3.beob.every(b=>b.t<0) || (KZ3.beob.length<nVor && KZ3.beob.every(b=>b.t<0 || b.t>2.0) && [...KZ3.waende.values()].every(W=>W.beob.every(i=>KZ3.beob.some(b=>b.id===i)))),
    `${nVor} -> ${KZ3.beob.length}`);
  attrappen({klasseW:()=>'stoer'}); const KZ4=neu(); speise(KZ4, 0, 1.0, 0, zweiWaende); G.karteRechnen(KZ4); G.karteEreignis(KZ4, {typ:'schrank', wand:'w0', t:1}); G.karteRechnen(KZ4);
  chk('Ereignis schrank: W.cls = schrank (M10), lmHoehenklasse ueberschreibt es nicht; Hinweis schrank', KZ4.waende.get('w0').cls==='schrank' && KZ4.waende.get('w1').cls==='stoer'
    && G.karteRechnen(KZ4).stand.hinweise.some(h=>h.code==='schrank' && h.wand==='w0'));
  G.karteEreignis(KZ4, {typ:'verdraengt', k:17, t:1.1}); G.karteEreignis(KZ4, {typ:'verdraengt', k:18, t:1.1}); const kk=G.karteRechnen(KZ4).kopf;
  chk('Ereignis verdraengt (Bild-Worker latest-wins) -> RundeKopf.verdraengt dieser Runde', JSON.stringify(kk.verdraengt)==='[17,18]' && G.karteRechnen(KZ4).kopf.verdraengt.length===0);
  G.karteEreignis(KZ4, {typ:'hoehe', laser:2.416, t:1.2}); G.karteEreignis(KZ4, {typ:'marke', id:1, p:[1,0,2], t:1.3}); G.karteEreignis(KZ4, {typ:'ref-reset', t:1.4});
  chk('Ereignisse hoehe (KZ.H weich), marke (gemerkt), ref-reset (an G.sessionCuts)', KZ4.H.laser===2.416 && KZ4.H.sigma===0.015 && KZ4.lauf.marken.length===1 && KZ4.lauf.ereignisse.some(e=>e.typ==='ref-reset'));
  const n=G.karteEbenen(KZ4, [{t:0.5, id:3, o:'v', pose:[0,0,0,0,0,0,1], poly:[]}]), e=KZ4.tiefe.ebenenAR[0];
  chk('karteEbenen: PlaneRec mit dem Bodenbezug der Zeile bis t (local -> Bezug) an G.ebeneAusAR, ab gesetzt', n===1 && e && e.ab===0 && e.bezug.length===16);
}

// ------------------------------------------------- KarteStand (3.6), Pruefsumme, Wiederholbarkeit (10.9)
{
  const lauf=(uhr)=>{ attrappen({klasse:i=>({klasse:i<15 ? 'nurT' : 'reloc', sP:0.01, sY:0.2*D2R}), knoten:A=>A.ab===0 ? (A.knoten || {t:Float64Array.from([0, 0.8]), s:Float64Array.from([0, 0.2]), d:Float64Array.from([0,0,0,0, 0.001,0.002,0,0.003]), cov:null}) : A.knoten});
    const KZ=neu({uhr, knoten:true}), st=[];
    speise(KZ, 0, 1.4, 0, zweiWaende); st.push(G.karteRechnen(KZ)); speise(KZ, 1.5, 2.4, 1, zweiWaende); st.push(G.karteRechnen(KZ)); st.push(G.karteRechnen(KZ, {schluss:true}));
    return {KZ, st}; };
  const A=lauf(null); let n=0; const B=lauf(()=>(n+=1000.37)), S=A.st[A.st.length-1].stand;
  chk('KarteStand serialisierbar (JSON, ohne Map) mit den Feldern aus 3.6', JSON.stringify(Object.keys(S))===JSON.stringify(['v','t','runde','waende','lokal','ecken','ringe','kandidaten','hypothesen','abschnitte','hoehen','hinweise','arbeit','ms','abschluss','fehler'])
    && JSON.parse(JSON.stringify(S)).abschnitte.length===2, Object.keys(S).join(','));
  chk('KarteStand.abschnitte[].knoten in der Form [{t, d:[4]}]; G.gBei nimmt diese Form', JSON.stringify(S.abschnitte[0].knoten)===JSON.stringify([{t:0, d:[0,0,0,0]}, {t:0.8, d:[0.001,0.002,0,0.003]}])
    && Math.abs(G.gBei(S.abschnitte[0], 0.4).tx-0.001)<1e-12);
  chk('KarteStand.waende nur rahmen -1; lokal = Karte des laufenden lokalen Abschnitts', S.waende.map(W=>W.id).join()==='w0,w1' && S.lokal && S.lokal.ab===1
    && S.lokal.waende.map(W=>W.id).join()==='w0@1,w1@1', JSON.stringify(S.lokal && S.lokal.waende.map(W=>W.id)));
  chk('Wiederholbarkeit: zwei Laeufe gleicher Eingabe -> gleiche Staende (ohne ms) und gleiche kopf-Pruefsummen, auch mit verstellter Uhr',
    A.st.every((r,i)=>ohneMs(r.stand)===ohneMs(B.st[i].stand) && r.kopf.kopf===B.st[i].kopf.kopf) && B.st[0].stand.ms.gesamt>1000, A.st.map(r=>r.kopf.kopf).join(' '));
  const KZ=A.KZ, k1=G.karteRechnen(KZ).kopf.kopf; KZ.abschnitte[0].knoten.d[5]+=1e-5; const k2=G.karteRechnen(KZ).kopf.kopf; KZ.abschnitte[0].knoten.d[5]-=1e-5; const k3=G.karteRechnen(KZ).kopf.kopf;
  chk('kopf deckt die Knoten ab (Aenderung 10 µm aendert die Pruefsumme, zurueck gleich)', k1!==k2 && k1===k3, `${k1} ${k2} ${k3}`);
}

// ------------------------------------------------- T1: Hilfen ohne Aufnahme
{
  const a=T1.argumente(['x.tar', '--H', '2.416', '--quelle=erfassungen', '--ohne', 'senk,tiefe', '--knoten', '--arbeit', 'iter=5,reg=100', '--ohneAb', '0,2', '--orakel-landmarken', '--runden']);
  const o=T1.optionenAus(a);
  chk('T1 Argumente: --name wert und --name=wert, Schalter, Listen', a._[0]==='x.tar' && o.H===2.416 && o.quelle==='erfassungen' && o.ohne.join()==='senk,tiefe' && o.knoten && o.arbeit.iter===5 && o.arbeit.reg===100
    && o.arbeit.relin===20000 && o.ohneAb.join()==='0,2' && o.orakelRahmen && o.orakelLandmarken && a.runden===true);
  chk('T1 Vorgaben wie 5.1/AB5: knoten aus, lago aus, pp fest, takt 0,5, inseln nein, Schlussrunde iter 20', !T1.DEF.knoten && T1.DEF.lago==='aus' && T1.DEF.pp==='fest' && T1.DEF.takt===0.5
    && T1.DEF.inseln==='nein' && T1.DEF.schluss.iter===20);
  // Epochen wie F2: +1 je Zeile mit T-Wechsel oder Bruch, hoechstens +1 je Zeile
  const C={t:0, Tpsi:1, Tx:2, Ty:3, Tz:4}, rows=[[0,0,0,0,0],[1,0,0,0,0],[2,0.1,0,0,0],[3,0.1,0,0,0],[4,0.1,0,0,0],[5,0.2,0,0,0],[6,0.2,0,0,0]];
  const ep=T1.epochen(rows, C, [{t:2.0}, {t:3.5}, {t:3.6}, {t:4.5}, {t:-1}]);
  chk('T1 Epochen (F2-Regel): T-Wechsel und Bruch an derselben Grenze +1, zwei Brueche in einer Spanne +1', Array.from(ep).join(',')==='0,0,1,1,2,3,3', Array.from(ep).join(','));
  const posen=[0, 0.1, 0.2, 0.3].map((t,i)=>({t, ep:i<2 ? 0 : 1}));
  const E=T1.erfassungenAus({art:'aufnahme', P:{obs:[{t:0.09, ra:{}, rb:{}}, {t:0.14, ra:{}, rb:{}}, {t:0.18, ra:{}, rb:{}, suspect:true}, {t:0.25, ra:{}, rb:{}, undone:true}]}}, posen, 'app');
  chk('T1 Erfassungen: ohne undone, app ohne suspect, Zeile = naechste der beiden umliegenden, ep der Zeile', E.length===2 && E[0].zeile===1 && E[1].zeile===1 && E[1].ep===0
    && T1.erfassungenAus({art:'aufnahme', P:{obs:[{t:0.18, ra:{}, rb:{}, suspect:true}]}}, posen, 'alle')[0].ep===1);
  const fl=T1.flipAtAus({events:[{type:'y-spiegel', t:5, an:true}, {type:'y-spiegel', t:9, an:false}], M:{bild:{flipY:false}}});
  chk('T1 flipY je Zeit aus den Ereignissen y-spiegel (wie flipAt)', fl(1)===false && fl(5)===true && fl(8)===true && fl(9.5)===false);
  // tiefe.bin.gz v1 und segmente.bin
  const kopf=Buffer.alloc(80); kopf.writeUInt32LE(3, 0); kopf.writeFloatLE(1.5, 4); kopf.writeUInt16LE(2, 8); kopf.writeUInt16LE(1, 10); kopf.writeFloatLE(0.001, 12); kopf.writeFloatLE(1, 16);
  const werte=Buffer.alloc(4); werte.writeUInt16LE(1000, 0); werte.writeUInt16LE(2000, 2);
  const T=T1.tiefeLesen(gzipSync(Buffer.concat([kopf, werte, kopf, werte])), {tiefe:{}});
  chk('T1 tiefe.bin.gz (Satz v1, 80 Byte Kopf) gelesen', T.length===2 && T[0].vi===3 && T[0].w===2 && T[0].raw[1]===2000 && Math.abs(T[0].scale-0.001)<1e-9 && T[0].M[0]===1);
  const sb=Buffer.alloc(14+10); sb.writeUInt32LE(5, 0); sb.writeFloatLE(0.5, 4); sb.writeUInt16LE(1, 8); sb.writeUInt16LE(287, 10); sb.writeUInt16LE(640, 12);
  sb.writeInt16LE(80, 14); sb.writeInt16LE(16, 16); sb.writeInt16LE(800, 18); sb.writeInt16LE(-8, 20); sb.writeUInt8(255, 22); sb.writeUInt8(2, 23);
  const S=T1.segmenteLesen(sb).get(5);
  chk('T1 segmente.bin (live 3.11, 1/8 px) gelesen', S && S.roh.length===1 && S.roh[0].x1===10 && S.roh[0].y1===2 && S.roh[0].x2===100 && S.roh[0].y2===-1 && S.roh[0].salience===1 && S.roh[0].kl===2);
  // --anker rel: Korrektur T^-1 · (A_neu ∘ A_t^-1) · T; ein Anker, der sich um 10 cm / 2° bewegt
  const Tz=[0.3, 1, 0, -2], An={M:{anker:{spalten:['t','anlass','kx','ky','kz','kpsi','bezug','vorher','anker']}}, anker:[[1,0,0,0,0,0,1,0,[[4, 1.0, -1.2, 2.0, 0.1]]], [5,'aenderung',0,0,0,0,1,0,[[4, 1.1, -1.2, 2.0, 0.1-2*D2R]]]]};
  const g=T1.ankerKorrektur(G, An, 4, 2, Tz), Cl=G.gKomp({psi:G.ankerPlan(0.1-2*D2R), tx:1.1, ty:-1.2, tz:2}, G.gInv({psi:G.ankerPlan(0.1), tx:1, ty:-1.2, tz:2}));
  const P=[0.5, 1.5, 0.7], Pl=G.gAnw(G.gAusT(Tz), P), soll=G.gAnw(G.gInv(G.gAusT(Tz)), G.gAnw(Cl, Pl)), ist=G.gAnw(g, P);
  chk('T1 --anker rel: ankerrelative Korrektur im Bezug der Zeile (neueste Lage des Ankers, 4 DoF)', Math.hypot(ist[0]-soll[0], ist[1]-soll[1], ist[2]-soll[2])<1e-12 && Math.abs(g.psi-2*D2R)<1e-12
    && T1.ankerKorrektur(G, An, 9, 2, Tz)===null);
  // Bodenmarken: gefroren = Treffer (local) -> Bezug der Zeile -> F0 (gBei); ankerrelativ zusaetzlich mit der Korrektur des Ankers
  const gF={psi:0.2, tx:1, ty:0, tz:-1}, lauf={KZ:{lauf:{marken:[{typ:'marke', t:2.5, id:'M1', p:[2.0, 0, 1.0], an:[4, 0, 0, 0, 0]}]}, schnitte:[]},
    posen:[{t:0, ep:0, T:Tz}, {t:3, ep:0, T:Tz}], letzte:{stand:{abschnitte:[{ab:0, g:gF, knoten:null}]}}, A:An};
  const BM=T1.bodenmarken(G, lauf, {marken:[{id:'M1', x:0, y:0}]}, {s:1, m:false, r:0, tx:0, ty:0}), pb=G.gAnw(G.gInv(G.gAusT(Tz)), [2.0, 0, 1.0]), gf=G.gPlan(gF, [pb[0], pb[2]]);
  const pr=G.gAnw(T1.ankerKorrektur(G, An, 4, 2.5, Tz), pb), gr=G.gPlan(gF, [pr[0], pr[2]]);
  chk('T1 Bodenmarken (--anker rel, S6-M): gefroren, ankerrelativ und Abstand zur Wahrheit je Marke', BM.length===1 && Math.hypot(BM[0].gefroren[0]-gf[0], BM[0].gefroren[1]-gf[1])<1e-12
    && Math.hypot(BM[0].rel[0]-gr[0], BM[0].rel[1]-gr[1])<1e-12 && Math.abs(BM[0].dGefroren-Math.hypot(...gf))<1e-12 && BM[0].dRel>0, `${BM[0] && BM[0].dGefroren.toFixed(3)} / ${BM[0] && BM[0].dRel.toFixed(3)} m`);
}

// ------------------------------------------------- T1: ganzer Lauf auf einer kleinen Sitzung (Attrappen), --runden, --weglassen
{
  const sitz=()=>{ const posen=[], bilder=[]; for(let i=0;i<60;i++){ const t=i*0.1, ep=i<30 ? 0 : 1, p=pose(+t.toFixed(2), ep, t*0.1, 0, ep ? [0.01,0.02,0,0] : [0,0,0,0]); p.v=i; posen.push(p);
      bilder.push({bildErg:bild(i, p.t, ep, zweiWaende), wahr:null}); }
    return {art:'sitzung', posen, breaks:[], ereignisse:[], bilder, erfassungen:[], proj:PROJ, w:287, h:640, hLaserMm:2416, warnungen:[]}; };
  attrappen(); G.toRoomDataRinge=(ringe)=>({pts:ringe.flatMap(R=>R.pts.map((p,i)=>({id:R.id+i, x:Math.round(1000*p[0]), y:Math.round(1000*p[1])}))), walls:[], meas:[], openings:[], hmeas:[], idSeq:0, openSeq:1});
  G.ringePruefen=r=>({ok:true, ringe:r, verworfen:[], fehler:null}); G.ringeHinweise=()=>({name:'Test', liste:[]}); G.bildNeu=()=>({});
  const L1=await T1.laufen(G, sitz(), {}), L2=await T1.laufen(G, sitz(), {uhr:0.5});
  chk('T1 laufen: Runden je 0,5 s Sitzungszeit (0,5 … 5,5 s bei Posen 0 … 5,9 s) plus Schlussrunde (iter 20), Export aus dem letzten Stand', L1.runden.length===12 && L1.runden[11].kopf.arbeit.iter===20 && L1.export && L1.export.pts.length===4,
    `${L1.runden.length} Runden`);
  chk('T1 laufen zweimal (einmal mit verstellter Uhr): Export byte-gleich, kopf-Folge gleich', JSON.stringify(L1.teilen)===JSON.stringify(L2.teilen) && L1.runden.map(r=>r.kopf.kopf).join()===L2.runden.map(r=>r.kopf.kopf).join());
  const L3=await T1.laufen(G, sitz(), {runden:L1.runden.slice(0, -1).map(r=>JSON.parse(JSON.stringify(r.kopf)))});
  if(process.env.DBG) console.log('DBG', L1.runden.map(r=>[r.kopf.kBis, r.kopf.tPose, r.kopf.t, r.kopf.kopf].join('/')).join(' '), '\nDBG', L3.runden.map(r=>[r.kopf.kBis, r.kopf.tPose, r.kopf.t, r.kopf.kopf].join('/')).join(' '));
  chk('T1 --runden: Nachspiel der eigenen karte.jsonl gibt in jeder Runde dieselbe kopf-Pruefsumme', L3.runden.length===L1.runden.length && L3.runden.every((r,i)=>r.kopf.kopf===L1.runden[i].kopf.kopf
    && r.kopf.kBis===L1.runden[i].kopf.kBis && r.kopf.tPose===L1.runden[i].kopf.tPose));
  const W1=await T1.laufen(G, sitz(), {weglassen:0.2, block:1.0, seed:3}), W2=await T1.laufen(G, sitz(), {weglassen:0.2, block:1.0, seed:3}), W3=await T1.laufen(G, sitz(), {weglassen:0.2, block:1.0, seed:4});
  chk('T1 --weglassen/--block/--seed: gleicher Samen gleiche Auswahl, anderer Samen andere (nur G.KG.rnd)', W1.info.weg.bild===W2.info.weg.bild && W1.info.weg.bild>=10
    && W1.runden.map(r=>r.kopf.kBis).join()===W2.runden.map(r=>r.kopf.kBis).join() && W3.runden.map(r=>r.kopf.kBis).join()!==W1.runden.map(r=>r.kopf.kBis).join(), `${W1.info.weg.bild} / ${W3.info.weg.bild} weg`);
  const Tr=T1.traege(G), leer=Tr.bild({}, {k:1, vi:1, t:0, ep:0, camTo:new Array(16).fill(0), proj:PROJ, flipY:false, w:287, h:640}), um=Tr.umriss();
  chk('T1 traege Platzhalter: genau die Namen aus 4 (M3-M9), leere Ergebnisse in der Form aus 3', Object.keys(Tr).length===T1.NAMEN.M3.length+T1.NAMEN.M4.length+T1.NAMEN.M5.length+T1.NAMEN.M6.length
    +T1.NAMEN.M7.length+T1.NAMEN.M8.length+T1.NAMEN.M9.length && leer.n===0 && leer.seg.length===0 && Array.isArray(um.ringe) && Tr.sectionOf([{t:1, epA:0, epB:1}], 2, 1)===1);
}

console.log(out.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
