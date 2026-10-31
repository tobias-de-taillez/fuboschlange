// Sprung-Test (Konzept 3.1 Punkt 4, P1 H3): sind ARCore-Spruenge eine Kartenkorrektur (dann bringt die Rueckwaerts-Anpassung der
// alten Erfassungen mit der Ankerkorrektur sie in den neuen Rahmen) oder ein Fehler? Verallgemeinert den Prototyp p1_anktest.mjs
// (ein Sprung, Anker 12, Abschnitte von Hand) auf jeden Bezugssprung der Aufnahme.
//
//   node raumskizze-sprung.mjs <aufnahme.tar> --protokoll p.json [--wahrheit w.json] [--H 2.6] [--aus ordner]
//        [--aufnahme Name=tar,protokoll[,wahrheit[,H]] ...]  (mehrere Aufnahmen, Summe darueber)
//
// Sprungliste: Brueche mit grund bezug-sprung/anker-sprung in A.breaks und die netz-Ereignisse (anlass sprung, netz, wieder),
// zusammengefasst, wenn sie weniger als 0,5 s auseinanderliegen. Verluste (anlass luecke) sind keine Spruenge: dort sind alle
// Anker pausiert, es gibt keine Ankerkorrektur.
// Korrektur je Sprung: C_lokal = A_neu o A_alt^-1 (wie T1 ankerKorrektur, aber mit der Lage direkt VOR und direkt NACH dem Sprung
// statt der neuesten), je Erfassung in ihren Bezug umgerechnet (T^-1 C T) und auf deren Strahlen angewandt. Ankerwahl:
//   'bezug'  der Bezugsanker vor dem Sprung (netz.bezug.id), wenn er beiderseits verfolgt ist
//   'netz'   Komponentenmedian (Gier, x, y, z) der uebrigen Anker, die beiderseits verfolgt sind (das Netz)
// Varianten je Sprung: roh (ohne Korrektur), +C und -C (C^-1: der Gegenprobe-Drehsinn, den p1 offen liess).
// Kennzahl: Abstand der Erfassungen zu den Wahrheitswaenden nach der FREIEN starren Anpassung (T2.passung) der gesamten Menge,
// Median und p90, nicht die Passung einzelner Abschnitte (deren freie Anpassung laeuft an Gittergrenzen, P1 1.1). Zwei Mengen:
//   'nachbar'  Abschnitt vor dem Sprung (bis zum vorigen Schnitt, hoechstens 60 s) und Abschnitt danach (bis zum naechsten Schnitt)
//   'rahmen'   alle Erfassungen der Rahmengruppen (zwischen harten Bruechen pausiert/sprung), die den Sprung umschliessen
// Die Korrektur wirkt nur auf die Erfassungen VOR dem Sprung. Urteil nach P1 H3: Median sinkt in mindestens 3 von 4 Spruengen und
// das Gesamtmedian verschlechtert sich nie um mehr als 1 cm; belastbar erst ab 12 Spruengen.
import {writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T1 from './raumskizze-karte.mjs';
import * as T2 from './raumskizze-metrik.mjs';
import {starrePassung} from './raumskizze-injektion.mjs';

export const VERSION=1;
// belastbar: mindestens 12 Spruenge mit Wahrheit UND eine Provokationssitzung (Messtag R8, Kamera 0,3/1/3/10 s abdecken). Die gibt es noch nicht,
// darum meldet jede Summe belastbar = false, egal wie viele Spruenge zusammenkommen (Konzept 3.1 Punkt 4: "endgueltig erst mit >= 12 Spruengen aus
// der Provokationssitzung"). mehrdeutig: T2-Gate fuer die Passung (Verhaeltnis zweitbeste/beste < 1,2 = mehrdeutig), solche Spruenge zaehlen nicht.
export const DEF={hFest:2.416, minErf:6, maxAbschnitt:60, verschmelzen:0.5, vorNachMax:{vor:60, nach:3}, besserCm:1.0, belastbar:12, provokationssitzung:false, mehrdeutigUnter:1.2};
const q=(a, p)=>{ const s=a.filter(Number.isFinite).sort((x, y)=>x-y); return s.length ? s[Math.min(s.length-1, Math.floor(p*s.length))] : NaN; };
const med=a=>q(a, 0.5), cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : '–', f1=x=>Number.isFinite(x) ? x.toFixed(1) : '–';
const D2R=Math.PI/180, wrap=a=>Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------ Sprungliste
export function spruenge(A, o={}){
  const op={...DEF, ...o}, L=[];
  for(const b of A.breaks||[]) if(/^(bezug|anker)-sprung$/.test(b.grund)) L.push({t:b.t, quelle:'bruch', grund:b.grund, d:b.d ?? null, dpsiDeg:b.dpsiDeg ?? null});
  for(const e of A.events||[]) if(e.type==='netz' && ['sprung', 'netz', 'wieder'].includes(e.anlass)) L.push({t:e.t, quelle:'netz', anlass:e.anlass, befund:e.befund, bezugId:e.bezug ? e.bezug.id : null, bezugZ:e.bezug ? e.bezug.z : null, ereignis:e.ereignis ?? null});
  L.sort((a, b)=>a.t-b.t);
  const out=[]; for(const s of L){ const v=out[out.length-1]; if(v && s.t-v.t<op.verschmelzen){ Object.assign(v, Object.fromEntries(Object.entries(s).filter(([k, x])=>x!=null && k!=='t' && k!=='quelle'))); v.quellen.push(s.quelle); } else out.push({...s, quellen:[s.quelle]}); }
  return out;
}

// ------------------------------------------------ Ankerlagen
const spalten=A=>A.M && A.M.anker && A.M.anker.spalten ? Object.fromEntries(A.M.anker.spalten.map((k, i)=>[k, i])) : {t:0, anker:8};
const verfolgt=e=>Array.isArray(e) && e.length>=5;
// Lage des Ankers id: 'vor' = letzte verfolgte Zeile vor t (hoechstens max s davor), 'nach' = erste verfolgte Zeile ab t (hoechstens max s danach)
export function ankerLage(A, id, t, seite, max){
  const C=spalten(A); let best=null;
  for(const z of A.anker){ const e=(z[C.anker]||[]).find(x=>x[0]===id && verfolgt(x)); if(!e) continue; const zt=z[C.t];
    if(seite==='vor'){ if(zt<t-1e-6 && t-zt<=max) best={t:zt, e}; }
    else if(zt>=t-1e-6){ if(zt-t<=max) best={t:zt, e}; break; } }
  return best;
}
export const ankerG=(G, a)=>({psi:G.ankerPlan(a[4]), tx:a[1], ty:a[2], tz:a[3]});
// C = A_neu o A_alt^-1: bildet die alte Lage des Ankers auf die neue ab
export const korrektur=(G, vor, nach)=>G.gKomp(ankerG(G, nach), G.gInv(ankerG(G, vor)));
// Zeit, vor der die Lage "alt" gilt: bei einem Sprung direkt vor ihm; bei 'wieder' (Anker kehren nach einem Verlust zurueck, die Zeilen
// kurz davor tragen schon die neue Lage) vor der letzten Luecke (netz-Ereignis anlass luecke) vor dem Wiedersehen.
export function vorGrenze(A, s){
  if(s.anlass!=='wieder') return s.t;
  const l=(A.events||[]).filter(e=>e.type==='netz' && e.anlass==='luecke' && e.t<s.t-1e-6).map(e=>e.t); return l.length ? Math.max(...l) : s.t;
}
// Ids aller Anker, die in A.anker zu t beiderseits verfolgt sind
function gemeinsameIds(A, t, op){
  const C=spalten(A), ids=new Set(); for(const z of A.anker){ if(z[C.t]<t-op.vorNachMax.vor || z[C.t]>t+op.vorNachMax.nach) continue; for(const e of z[C.anker]||[]) if(verfolgt(e)) ids.add(e[0]); }
  return [...ids].filter(id=>ankerLage(A, id, t, 'vor', op.vorNachMax.vor) && ankerLage(A, id, t, 'nach', op.vorNachMax.nach));
}
// Korrekturen eines Sprungs: [{name, ids, C, d, dpsiDeg}]
export function korrekturen(G, A, s, o={}){
  const op={...DEF, ...o}, tv=vorGrenze(A, s), ids=gemeinsameIds(A, s.t, op).filter(id=>ankerLage(A, id, tv, 'vor', op.vorNachMax.vor)), out=[];
  const lage=id=>{ const v=ankerLage(A, id, tv, 'vor', op.vorNachMax.vor), n=ankerLage(A, id, s.t, 'nach', op.vorNachMax.nach); return {id, vor:v, nach:n, C:korrektur(G, v.e, n.e), bewegt:Math.hypot(n.e[1]-v.e[1], n.e[3]-v.e[3]), tVor:v.t}; };
  const bez=s.bezugId!=null && ids.includes(s.bezugId) ? lage(s.bezugId) : null, rest=ids.filter(id=>id!==s.bezugId).map(lage);
  const info=C=>({d:Math.hypot(C.tx, C.tz), dpsiDeg:C.psi/D2R});   // d: Betrag der Verschiebung von C um den Ursprung (enthaelt den Drehhebel), bewegt: Weg des Ankers selbst
  if(bez) out.push({name:'bezug', ids:[bez.id], C:bez.C, ...info(bez.C), bewegt:bez.bewegt, tVor:bez.tVor});
  if(rest.length){ const C={psi:med(rest.map(r=>r.C.psi)), tx:med(rest.map(r=>r.C.tx)), ty:med(rest.map(r=>r.C.ty)), tz:med(rest.map(r=>r.C.tz))}; out.push({name:'netz', ids:rest.map(r=>r.id), C, ...info(C), bewegt:med(rest.map(r=>r.bewegt)), tVor:med(rest.map(r=>r.tVor))}); }
  return out;
}
// Strahl-Umrechnung wie T1 strahlMit
const strahlMit=(G, g, r)=>({...r, o:G.gAnw(g, r.o), d:G.gAnw({...g, tx:0, ty:0, tz:0}, r.d)});
// C (lokal) in den Bezug der Erfassung: g = T^-1 C T
export const imBezug=(G, C, T)=>{ const gT=G.gAusT(T); return G.gKomp(G.gInv(gT), G.gKomp(C, gT)); };

// ------------------------------------------------ Mengen
export function schnitte(A){ return (A.breaks||[]).filter(b=>/^(pausiert|sprung)$/.test(b.grund)).map(b=>b.t).sort((a, b)=>a-b); }
// Rahmengruppen: [t0, t1) zwischen harten Bruechen
export function gruppen(A, tEnde){ const c=schnitte(A); const g=[]; let t0=-Infinity; for(const t of c){ g.push([t0, t]); t0=t; } g.push([t0, tEnde]); return g; }
// tv: Ende der alten Erfassungen (vorGrenze); die Erfassungen zwischen tv und s.t (nur bei 'wieder') liegen im Niemandsland und gehen in keine Menge.
export function mengen(A, s, sprungZeiten, erf, tv=s.t, o={}){
  const op={...DEF, ...o}, tEnde=erf.length ? erf[erf.length-1].t+1 : s.t+1, G=gruppen(A, tEnde), hart=schnitte(A), alle=[...hart, ...sprungZeiten];
  const schnittVor=Math.max(-Infinity, ...alle.filter(t=>t<tv-1e-6)), schnittNach=Math.min(Infinity, ...alle.filter(t=>t>s.t+1e-6));
  const aLo=Math.max(schnittVor, tv-op.maxAbschnitt), bHi=Math.min(schnittNach, s.t+op.maxAbschnitt);
  const nachbar={alt:erf.filter(e=>e.t>=aLo && e.t<tv), neu:erf.filter(e=>e.t>=s.t && e.t<bHi)};
  const gruppeVon=t=>G.find(([a, b])=>t>=a && t<b), gAlt=gruppeVon(tv-1e-3), gNeu=gruppeVon(s.t+1e-3);
  const von=Math.min(gAlt ? gAlt[0] : tv, gNeu ? gNeu[0] : s.t), bis=Math.max(gAlt ? gAlt[1] : tv, gNeu ? gNeu[1] : s.t);
  const rahmen={alt:erf.filter(e=>e.t>=von && e.t<tv), neu:erf.filter(e=>e.t>=s.t && e.t<bis)};
  return {nachbar, rahmen, von, bis, tv};
}

// ------------------------------------------------ Messen
// Erfassungen vor dem Sprung mit g (je Erfassung im eigenen Bezug) umrechnen, gemeinsam mit den neuen an die Wahrheit passen
export function messen(G, W, H0, alt, neu, C, posen){
  const korr=C ? alt.map(e=>{ const g=imBezug(G, C, posen[e.zeile].T); return {...e, ra:strahlMit(G, g, e.ra), rb:strahlMit(G, g, e.rb)}; }) : alt;
  const r=starrePassung(G, [...korr, ...neu], H0, W); if(!r) return null;
  return {n:r.d.length, med:med(r.d), p90:q(r.d, 0.9), T:r.T, verhaeltnis:r.pa.verhaeltnis};
}
const gleicheLage=(a, b)=>a && b && Math.abs(wrap(a.r-b.r))<5*D2R && Math.hypot(a.tx-b.tx, a.ty-b.ty)<0.5 && !!a.m===!!b.m;

export async function pruefen(G, A, W, o={}){
  const op={...DEF, ...o}, H0=Number.isFinite(op.H) ? op.H : A.hLaserMm ? A.hLaserMm/1000 : op.hFest, posen=T1.posenAus(G, A), erf=T1.erfassungenAus(A, posen, 'app', G), S=spruenge(A, op), zeiten=S.map(s=>s.t), rows=[];
  for(const s of S){
    const Ks=korrekturen(G, A, s, op), M=mengen(A, s, zeiten.filter(t=>t!==s.t), erf, s.anlass==='wieder' && Ks.length ? Ks[0].tVor+1e-3 : s.t, op), row={t:s.t, grund:s.grund ?? s.anlass ?? null, befund:s.befund ?? null, quellen:s.quellen, bezugId:s.bezugId ?? null,
      korrekturen:Ks.map(k=>({name:k.name, ids:k.ids, dCm:100*k.d, dpsiDeg:k.dpsiDeg, ankerBewegtCm:100*k.bewegt, tVor:k.tVor})), mengen:{}};
    if(!W){ rows.push({...row, urteil:'ohne Wahrheit'}); continue; }
    for(const [mn, m] of [['nachbar', M.nachbar], ['rahmen', M.rahmen]]){
      const ok=m.alt.length>=op.minErf && m.neu.length>=op.minErf, e={nAlt:m.alt.length, nNeu:m.neu.length, ok, varianten:{}};
      if(ok){ e.varianten.roh=messen(G, W, H0, m.alt, m.neu, null, posen);
        for(const k of Ks){ e.varianten['+'+k.name]=messen(G, W, H0, m.alt, m.neu, k.C, posen); e.varianten['-'+k.name]=messen(G, W, H0, m.alt, m.neu, G.gInv(k.C), posen); }
        const r0=e.varianten.roh; for(const v of Object.values(e.varianten)) if(v && r0){ v.dMedCm=100*(v.med-r0.med); v.dP90Cm=100*(v.p90-r0.p90); v.lageGleich=gleicheLage(v.T, r0.T); } }
      row.mengen[mn]=e; }
    rows.push(row); }
  return {H0, rows, zusammenfassung:zusammenfassen(rows, op)};
}

// Summe: je Menge und Variante Anzahl besser/schlechter und mittlere Aenderung; Urteil nach P1 H3 fuer die Variante +C
export function zusammenfassen(rows, op=DEF){
  const mitW=rows.filter(r=>r.mengen && Object.keys(r.mengen).length).length;
  const Z={n:rows.length, mitWahrheit:mitW, auswertbar:{}, belastbar:mitW>=op.belastbar && op.provokationssitzung === true,
    hinweis:`NICHT belastbar: ${mitW} Spruenge mit Wahrheit (von ${rows.length}); verlangt sind >= ${op.belastbar} aus der Provokationssitzung (R8), die es noch nicht gibt; ein Richtungsindiz, kein Beleg`};
  const klar=r=>{ const v=r.verhaeltnis; return v==null || v>=op.mehrdeutigUnter; };         // roh-Passung eindeutig?
  for(const mn of ['nachbar', 'rahmen']){ const ok=rows.filter(r=>r.mengen && r.mengen[mn] && r.mengen[mn].ok && r.mengen[mn].varianten.roh).filter(r=>klar(r.mengen[mn].varianten.roh)), V={};
    const mehrdeutig=rows.filter(r=>r.mengen && r.mengen[mn] && r.mengen[mn].ok && r.mengen[mn].varianten.roh && !klar(r.mengen[mn].varianten.roh)).length;
    const namen=new Set(ok.flatMap(r=>Object.keys(r.mengen[mn].varianten))); namen.delete('roh');
    for(const nm of namen){ const alle=ok.map(r=>r.mengen[mn].varianten[nm]).filter(v=>v && Number.isFinite(v.dMedCm)), d=alle.filter(v=>v.lageGleich!==false), dm=d.map(v=>v.dMedCm);
      V[nm]={n:d.length, ausgeschlossenLage:alle.length-d.length, besser:dm.filter(x=>x<0).length, schlechterUeber1cm:dm.filter(x=>x>op.besserCm).length, dMedMittel:dm.length ? dm.reduce((a, b)=>a+b, 0)/dm.length : NaN, dMedMedian:med(dm), lageGesprungen:d.filter(v=>!v.lageGleich).length};
      const von=nm[0]==='+' ? 'H3' : null; if(von){ const n=d.length, drei=Math.ceil(0.75*n); V[nm].h3={bedingung:`Median sinkt in mindestens ${drei} von ${n} und nie schlechter als ${op.besserCm} cm`, erfuellt:n>0 && V[nm].besser>=drei && V[nm].schlechterUeber1cm===0}; } }
    Z.auswertbar[mn]={spruenge:ok.length, mehrdeutigAusgeschlossen:mehrdeutig, varianten:V}; }
  return Z;
}

// ------------------------------------------------ Bericht
export function markdown(name, erg){
  const L=[`## Sprung-Test ${name} (v${VERSION}), H ${erg.H0} m`, ''];
  L.push('| t | Anlass | Befund | Korrektur (Anker: Weg; C: Betrag / Gier) | Menge | n alt/neu | roh Median/p90 cm | +C | -C |', '|---|---|---|---|---|---|---|---|---|');
  const fm=v=>v ? `${cm(v.med)}/${cm(v.p90)}${v.lageGleich===false ? ' (Lage gesprungen)' : ''}` : '–';
  for(const r of erg.rows){ const ks=r.korrekturen.map(k=>`${k.name} [${k.ids.join(',')}] Anker ${f1(k.ankerBewegtCm)} cm, C ${f1(k.dCm)} cm / ${f1(k.dpsiDeg)}°`).join('; ') || 'keine Anker beiderseits';
    if(!r.mengen || !Object.keys(r.mengen).length){ L.push(`| ${r.t} | ${r.grund} | ${r.befund ?? '–'} | ${ks} | – | – | ${r.urteil || '–'} | | |`); continue; }
    for(const [mn, m] of Object.entries(r.mengen)){
      if(!m.ok){ L.push(`| ${r.t} | ${r.grund} | ${r.befund ?? '–'} | ${ks} | ${mn} | ${m.nAlt}/${m.nNeu} | zu wenige Erfassungen | | |`); continue; }
      const vs=Object.entries(m.varianten).filter(([k])=>k!=='roh').map(([k, v])=>`${k} ${fm(v)} (${v && v.dMedCm>0 ? '+' : ''}${f1(v && v.dMedCm)})`);
      L.push(`| ${r.t} | ${r.grund} | ${r.befund ?? '–'} | ${ks} | ${mn} | ${m.nAlt}/${m.nNeu} | ${fm(m.varianten.roh)} | ${vs.filter(x=>x.startsWith('+')).join('; ') || '–'} | ${vs.filter(x=>x.startsWith('-')).join('; ') || '–'} |`); } }
  return [...L, '', summeText(erg.zusammenfassung)].join('\n');
}
export function summeText(Z){
  const L=[`Summe: ${Z.n} Spruenge. ${Z.hinweis}.`];
  for(const [mn, a] of Object.entries(Z.auswertbar)){ L.push(`- Menge ${mn}: ${a.spruenge} auswertbar, ${a.mehrdeutigAusgeschlossen} wegen mehrdeutiger Passung (< 1,2) ausgeschlossen`);
    for(const [nm, v] of Object.entries(a.varianten)) L.push(`  - ${nm}: besser ${v.besser}/${v.n}, schlechter > 1 cm ${v.schlechterUeber1cm}/${v.n}, Aenderung Median mittel ${f1(v.dMedMittel)} cm (Median ${f1(v.dMedMedian)}), Lage gesprungen und ausgeschlossen ${v.ausgeschlossenLage}${v.h3 ? `; H3 ${v.h3.erfuellt ? 'erfuellt' : 'NICHT erfuellt'} (${v.h3.bedingung})` : ''}`); }
  return L.join('\n');
}

// ------------------------------------------------ Kommandozeile
async function lauf(G, name, tar, prot, wahr, H){
  const A=T1.ladeQuelle(resolve(tar), {protokoll:prot ? resolve(prot) : null}), W=wahr ? T2.wahrheitLaden(resolve(wahr)) : null;
  const erg=await pruefen(G, A, W, Number.isFinite(H) ? {H} : {}); return {name, ...erg};
}
async function main(){
  const a=T1.argumente(process.argv.slice(2)), {G}=await T1.ladeSeite({}), L=[], liste=[];
  const av=process.argv.slice(2), mehrere=av.flatMap((x, i)=>x==='--aufnahme' ? [av[i+1]] : []);
  if(mehrere.length){ for(const s of mehrere){ const [n, rest]=String(s).split('='), [tar, prot, wahr, H]=rest.split(','); liste.push([n, tar, prot, wahr, H ? +H : NaN]); } }
  else if(a._[0]) liste.push([a.name || 'A', a._[0], a.protokoll, a.wahrheit, a.H!=null && a.H!==true ? +a.H : NaN]);
  else { console.error('Aufruf: node raumskizze-sprung.mjs <aufnahme.tar> --protokoll p.json [--wahrheit w.json] [--H 2.6] [--aus ordner]'); process.exit(1); }
  for(const [n, tar, prot, wahr, H] of liste){ const r=await lauf(G, n, tar, prot, wahr, H); L.push(r); console.log(markdown(n, r)+'\n'); }
  const alle={n:L.reduce((s, r)=>s+r.rows.length, 0), mitWahrheit:L.reduce((s, r)=>s+r.rows.filter(x=>x.mengen && Object.keys(x.mengen).length).length, 0)};
  const pool=zusammenfassen(L.flatMap(r=>r.rows)), flur=zusammenfassen(L.filter(r=>/^flur/.test(r.name)).flatMap(r=>r.rows)); alle.pool=pool; alle.flur=flur;
  console.log('Nur Flur 16:25 (die einzige tragfaehige Wahrheit, Konzept 3.3)\n'+summeText(flur)+'\n\nAlle Aufnahmen gemeinsam (nur Spruenge mit Wahrheit zaehlen als auswertbar; Wohnkuechen-Wahrheit mehrdeutig 1,00-1,11, Zuordnung von 31.10. 08:47 nicht belegt)\n'+summeText(pool));
  console.log(`Alle Aufnahmen: ${alle.n} Spruenge, davon ${alle.mitWahrheit} mit Wahrheit; NICHT belastbar: verlangt sind >= ${DEF.belastbar} Spruenge aus der Provokationssitzung (R8), die es noch nicht gibt.`);
  if(a.aus){ const d=resolve(a.aus); mkdirSync(d, {recursive:true});
    writeFileSync(join(d, 'sprung.json'), JSON.stringify({version:VERSION, alle, aufnahmen:L}, (k, v)=>typeof v==='number' && !Number.isFinite(v) ? null : v, 1));
    writeFileSync(join(d, 'sprung.md'), L.map(r=>markdown(r.name, r)).join('\n\n')+'\n'); console.log(`Ausgabe: ${d}/sprung.{json,md}`); }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{ console.error(e.stack || e.message); process.exit(1); });
