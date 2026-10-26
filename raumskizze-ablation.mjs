// raumskizze-ablation.mjs — Offline-Ablation "Sichtfeld beschneiden" (Doku 12.7, Hebel (d)): Wie stark haengt die Karte
// (Stand 7: T1 raumskizze-karte.mjs mit den Modulen der Seite) vom horizontalen Sichtfeld der Kamera ab? Heute sieht sie
// 34,6° quer. Je Aufnahme x Quelle x Faktor ein Lauf von T1 mit --sichtfeld f (mittiger Ausschnitt, gleiche Brennweite in px)
// in einem eigenen Node-Prozess (--jobs n parallel), Messung gegen die Wahrheit mit T2 wie in T1 main. Ergebnis im --aus-Ordner:
// ablation.md und ablation.json (Tabelle, Steigungen), je Lauf laeufe/<id>/{kennzahlen.json, bericht.txt, export.json, plan.svg, log.txt}.
//
//   node raumskizze-ablation.mjs --aufnahme A6=aufnahme6.tar,protokoll6.json [--aufnahme A7=...] --aus ordner
//        [--wahrheit w.json] [--H 2.416|--ohneH] [--faktoren 1,0.8,0.6,0.4] [--quellen segmente,beide,erfassungen] [--ohne tiefe,ebenen]
//        [--erf lassen,schneiden] [--jobs 4] [--zeitgrenze 1800] [--t1 '--takt 0.5 --arbeit iter=3'] [--weiter] [--nur-tabelle]
//   node raumskizze-ablation.mjs --lauf auftrag.json      (ein Lauf; so startet das Werkzeug seine Kindprozesse)
//   import {kennzahlen, steigung, steigungen, tabelleMd, ablation, ...} from './raumskizze-ablation.mjs'
//
// Aufnahmen: Name=Quelle[,Protokoll]; Quelle wie bei T1 (TAR, Ordner oder synthetische Sitzung .jsonl.gz). Die Pfade
// stehen nur in den Argumenten (die Aufnahmen liegen oft in Temp-Ordnern).
// Laser-H wie T1: aus dem Protokoll (hLaserMm), --H fuer alle Aufnahmen, --ohneH ohne. Die Wohnkueche A7 hat kein hLaserMm
// im Protokoll (A6, A8: 2416): dort --H 2.416 geben. Die Tabelle nennt H je Lauf und warnt, wenn es fehlt.
// Gleiche Bedingungen fuer alle Faktoren: --ohne tiefe,ebenen auch bei f = 1. T1 erzwingt tiefe bei f < 1 (die Tiefe muesste
// sonst mitbeschnitten werden), und Stand 7 live nutzt beides nicht (12.6); sonst unterschieden sich f = 1 und f < 1 in zwei Dingen.
// Erfassungen (--erf): 'lassen' (Vorgabe) wie T1 --sichtfeld-erf lassen: ihre Strahlen haengen nicht am Bild, nur proj'
// (Sichtbarkeit in M4/M5) und die ndc der Enden gehen mit dem Faktor; sie bleiben alle drin, auch mit Enden ausserhalb des
// Ausschnitts (T1 zaehlt sie). Die Referenz 'erfassungen' ist bei kleinem f darum optimistisch, und in 'beide' geben sie die
// Stufen der Abschnitte vor (Gegenpruefung A8: 6/13/0/0 bei jedem Faktor): die Steigung ist dort eine Untergrenze.
// 'schneiden' rechnet die Quellen mit Erfassungen bei f < 1 zusaetzlich mit Erfassungen, wie die engere Kamera sie saehe
// (T1 --sichtfeld-erf schneiden); f = 1 ist dafuer derselbe Lauf wie 'lassen' und wird nicht doppelt gerechnet.
// Geteilte Waende (12.5: die Groesse, die fehlt): globale Waende (rahmen -1) mit zugeordneten Beob (b.L = Wand) aus >= 2
// Abschnitten, einmal alle Beob, einmal nur Bild-Segmente (ohne Erfassungen). Das ist nicht dasselbe Mass wie "0-8 %
// Wandlaenge an Schnitten" (ARCHITEKTUR 19, kern 3), sondern das, was ein engeres oder weiteres Bild direkt aendert.
// Absolutzahlen wachsen mit der Zahl der Segment-Beob (A8 beide f 1: 371 globale Waende gegen 24 der Wahrheit, also vor
// allem Bruchstuecke); fuer die Verbindung zaehlen der Anteil an den globalen Waenden und 'geteilt Seg je 1000 Seg-Beob'.
// Ein wahrheitsbezogenes Mass (Wahrheitswaende mit Beob aus >= 2 Abschnitten) braeuchte je Abschnitt eine eigene Passung
// und fehlt darum; unter der Gesamtpassung mischte es Sichtbarkeit und Verbindung.
// Passung: IoU, Ecken-Median, gefundene Waende und Beob-Median haengen an der Lage aus T2 und gehen nur bei eindeutiger
// Passung in die Steigung (Mehrdeutigkeit >= 1,2 und gueltiger Massstab); sonst sind sie in einer beliebigen Lage gemessen
// (A8: mit jeder Quelle mehrdeutig, 1,00-1,01). Die Flaeche ist die des Exports selbst (T2 passt starr, s = 1) und bleibt.
// Stufen: dazu je Lauf die nachregistrierten Abschnitte (Hinweis 'abschnitt-registriert', 19.2 Z13) und die nur ueber die
// Kette gehaltenen ('abschnitt-kette'); ablation.md merkt Gruppen an, deren Stufen sich ueber die Faktoren nicht aendern.
// Steigung: kleinste Quadrate je Aufnahme, Quelle und Erf ueber das wirksame Sichtfeld in Grad, angegeben je 10°.
// Laufzeit: f = 1 dekodiert und sucht Kanten auf der vollen Breite und ist darum der laengste Lauf je Aufnahme; T2 braucht
// rund 90 % (A8 beide f 1 mit T2 etwa 200 s). Je Lauf eine Zeitgrenze (--zeitgrenze s, Vorgabe 1800): ein haengender
// Kindprozess (ffmpeg, T2) wird mit SIGKILL beendet und zur Fehlerzeile.
// --weiter und --nur-tabelle uebernehmen eine fertige kennzahlen.json nur bei gleicher Werkzeug-Version, gleichen
// T1-Argumenten und gleicher Wahrheit; sonst rechnet --weiter neu, und --nur-tabelle zeigt eine Fehlerzeile.
import {readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, statSync, rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {availableParallelism} from 'node:os';
import {resolve, join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T1 from './raumskizze-karte.mjs';
import * as T2 from './raumskizze-metrik.mjs';

export const VERSION=2;
export const DEF={faktoren:[1, 0.8, 0.6, 0.4], quellen:['segmente', 'beide', 'erfassungen'], ohne:['tiefe', 'ebenen'], erf:['lassen'], H:undefined,
  jobs:Math.max(1, Math.min(6, Math.floor(availableParallelism()/2))), t1:[], zeitgrenze:1800};
const R2D=180/Math.PI;
const f1=x=>Number.isFinite(x) ? x.toFixed(1) : '–', f2=x=>Number.isFinite(x) ? x.toFixed(2) : x===Infinity ? '∞' : '–', cm=x=>Number.isFinite(x) ? (100*x).toFixed(1) : '–';
// T2 meldet die Mehrdeutigkeit Infinity, wenn es keine zweite Lage gibt; JSON kennt das nicht (sonst null, also '–' statt eindeutig)
export const schreibeJson=(datei, x)=>writeFileSync(datei, JSON.stringify(x, (k,v)=>v===Infinity ? 'Infinity' : v===-Infinity ? '-Infinity' : v, 1));
export const leseJson=datei=>JSON.parse(readFileSync(datei, 'utf8'), (k,v)=>v==='Infinity' ? Infinity : v==='-Infinity' ? -Infinity : v);

// ------------------------------------------------ Kennzahlen eines Laufs
// lauf: Rueckgabe von T1.laufen, m: T2.metrik (oder null). Alles aus dem letzten Stand bzw. KZ, nichts aus ergebnis.json
// (dort fehlen die Beob und die Abschnitte je Wand).
export function kennzahlen(lauf, m=null){
  const S=lauf.letzte.stand, KZ=lauf.KZ, stufen={verbunden:0, locker:0, lose:0, lokal:0}, abQuelle={};
  for(const a of S.abschnitte){ stufen[a.stufe]=(stufen[a.stufe]||0)+1; const q=a.quelle || '–'; abQuelle[q]=(abQuelle[q]||0)+1; }
  // Beob ueber ihre id (rueckgaengig nimmt Beob aus KZ.beob heraus; die id ist dann nicht mehr der Index)
  const B=new Map(KZ.beob.map(b=>[b.id, b])), glob=[...KZ.waende.values()].filter(W=>W.rahmen===-1);
  const abZahl=(W, nurSeg)=>{ const s=new Set(); for(const id of W.beob||[]){ const b=B.get(id); if(b && b.L===W.id && (!nurSeg || !b.nutzer)) s.add(b.ab); } return s.size; };
  const geteilt=glob.filter(W=>abZahl(W, false)>=2).length, geteiltSeg=glob.filter(W=>abZahl(W, true)>=2).length;
  const erfBeob=KZ.beob.filter(b=>b.nutzer).length, eckBeob=KZ.beob.filter(b=>!b.nutzer && b.art==='ecke').length, segBeob=KZ.beob.length-erfBeob-eckBeob;
  const a=m && !m.fehler && m.aussen && !m.aussen.fehlt ? m.aussen : null, SF=lauf.info.sichtfeld || null, proj=lauf.A && lauf.A.proj;
  const hfov=SF ? SF.hfov[1] : proj ? 2*Math.atan(1/Math.abs(proj[0]))*R2D : null, hinw=c=>(S.hinweise||[]).filter(h=>h.code===c).length;
  return {abschnitte:S.abschnitte.length, stufen, abQuelle, registriert:hinw('abschnitt-registriert'), kette:hinw('abschnitt-kette'),
    waendeGlobal:S.waende.length, waendeLokal:KZ.waende.size-glob.length, geteilt, geteiltSeg,
    anteilGeteilt:glob.length ? geteilt/glob.length : null, anteilGeteiltSeg:glob.length ? geteiltSeg/glob.length : null, geteiltSegJe1000:segBeob ? 1000*geteiltSeg/segBeob : null,
    beob:KZ.beob.length, segBeob, eckBeob, erfBeob,
    bilder:lauf.info.bilder, export:!!lauf.export, ecken:lauf.export ? lauf.export.pts.length : 0,
    ringe:S.ringe.filter(R=>R.exportiert!==false).map(R=>R.art[0]+R.pts.length).join(',') || '–', kern:KZ.kern ?? null, runden:lauf.runden.length,
    iou:a ? a.iou : null, eckenMed:a ? a.eMed : null, flaeche:a ? a.A : null, flaecheWahr:a ? a.AT : null,
    waendeGefunden:m && m.waende ? m.waende.gefunden : null, waendeWahr:m && m.waende ? m.waende.nWahr : null,
    beobMed:m && m.beob && m.beob.gehoben && m.beob.gehoben.alle ? m.beob.gehoben.alle.med : null, mehrdeutig:m && m.passung ? m.passung.verhaeltnis ?? null : null,
    // Passung gueltig (T2: Mehrdeutigkeit >= 1,2 und gueltiger Massstab): sonst sind IoU, Ecken, gefundene Waende und der
    // Beob-Median in einer beliebigen Lage gemessen (A8: alle Quellen 1,00-1,01) und gehen nicht in die Steigung ein
    passungGueltig:!!(m && m.passung && m.passung.verhaeltnis!=null && m.passung.verhaeltnis>=1.2 && m.passung.skala!=null),
    metrikFehler:m && m.fehler ? m.fehler : null, hLaser:lauf.hLaser ?? null,
    fEff:SF ? SF.fEff : 1, w2:SF ? SF.w2 : lauf.A ? lauf.A.w : null, hfov, erfEndenAussen:SF ? SF.erfEndenAussen : 0, erfEnden:SF ? SF.erfEnden : null,
    erfModus:SF ? SF.erfModus || 'lassen' : 'lassen', erfSchnitt:SF ? SF.erfSchnitt || null : null, seg:SF ? SF.seg : null, warnungen:lauf.info.warnungen};
}

// Steigung der kleinsten Quadrate y = a + b·x ueber die Paare mit endlichem x und y; null bei < 2 Paaren oder ohne Streuung in x.
export function steigung(xs, ys){
  const P=xs.map((x,i)=>[x, ys[i]]).filter(([x,y])=>Number.isFinite(x) && Number.isFinite(y));
  if(P.length<2) return null;
  const mx=P.reduce((s,p)=>s+p[0], 0)/P.length, my=P.reduce((s,p)=>s+p[1], 0)/P.length;
  let sxx=0, sxy=0, syy=0; for(const [x,y] of P){ sxx+=(x-mx)*(x-mx); sxy+=(x-mx)*(y-my); syy+=(y-my)*(y-my); }
  if(!(sxx>0)) return null;
  const b=sxy/sxx; return {b, a:my-b*mx, n:P.length, r2:syy>0 ? sxy*sxy/(sxx*syy) : null};
}
// Kennzahlen, deren Steigung ueber das Sichtfeld (°) die Tabelle zeigt; die normierten zuerst (sie messen die Verbindung),
// die Absolutzahlen danach (sie skalieren mit der Zahl der Segmente).
export const STEIGUNG=[['anteilGeteilt', 'Anteil geteilt'], ['anteilGeteiltSeg', 'Anteil geteilt nur Seg'], ['geteiltSegJe1000', 'geteilt Seg je 1000 Seg-Beob'],
  ['verbunden', 'Abschnitte verbunden'], ['registriert', 'nachregistriert'], ['exportZahl', 'Export (0/1)'],
  ['iou', 'IoU*'], ['eckenMed', 'Ecken Median (m)*'], ['waendeGefunden', 'Wände gefunden*'], ['beobMed', 'Beob Median (m)*'],
  ['geteilt', 'geteilt abs.'], ['geteiltSeg', 'geteilt nur Seg abs.'], ['segBeob', 'Segment-Beob'], ['waendeGlobal', 'Wände global abs.'], ['waendeLokal', 'Wände lokal']];
// an der Lage aus T2: nur mit eindeutiger Passung in der Steigung
export const AN_PASSUNG=new Set(['iou', 'eckenMed', 'waendeGefunden', 'beobMed']);
const wert=(z,k)=>{ if(!z.k || z.fehler || (AN_PASSUNG.has(k) && !z.k.passungGueltig)) return null;
  const v=k==='verbunden' ? z.k.stufen.verbunden : k==='exportZahl' ? (z.k.export ? 1 : 0) : z.k[k]; return Number.isFinite(v) ? v : null; };
const erfVon=z=>z.erf || 'lassen', voll=z=>!!(z.k && !z.fehler && z.k.fEff===1);
// Gruppen je Aufnahme, Quelle und Erf. Bei f = 1 ist 'schneiden' derselbe Lauf wie 'lassen' (kein Fenster), darum zaehlt
// der volle Lauf von 'lassen' auch in der Gruppe 'schneiden', solange die keinen eigenen hat.
export function steigungen(zeilen){
  const gruppen=new Map();
  for(const z of zeilen){ const g=[z.aufnahme, z.quelle, erfVon(z)].join('|'); if(!gruppen.has(g)) gruppen.set(g, []); gruppen.get(g).push(z); }
  for(const [g, Z] of gruppen){ const [au, q, e]=g.split('|'); if(e==='lassen' || Z.some(voll)) continue;
    const L=gruppen.get([au, q, 'lassen'].join('|')); if(L) Z.unshift(...L.filter(voll)); }
  return [...gruppen].map(([g, Z])=>{ const xs=Z.map(z=>z.k && !z.fehler ? z.k.hfov : null), je10Grad={}, nJe={};
    for(const [k] of STEIGUNG){ const ys=Z.map(z=>wert(z, k)), s=steigung(xs, ys); je10Grad[k]=s ? 10*s.b : null; nJe[k]=xs.filter((x,i)=>Number.isFinite(x) && Number.isFinite(ys[i])).length; }
    return {aufnahme:Z[0].aufnahme, quelle:Z[0].quelle, erf:g.split('|')[2], n:xs.filter(Number.isFinite).length, nGueltig:Z.filter(z=>z.k && !z.fehler && z.k.passungGueltig).length,
      ids:Z.map(z=>z.id), je10Grad, nJe}; });
}
// Vorab-Hinweise, die die Lesart einzelner Gruppen aendern (Gegenpruefung: auf A8 liefert die Tabelle nur Strukturzahlen)
export function hinweiseMd(zeilen, st){
  const H=[], nachId=new Map(zeilen.map(z=>[z.id, z]));
  for(const g of st){ const Z=g.ids.map(id=>nachId.get(id)).filter(z=>z && z.k && !z.fehler), name=`${g.aufnahme}/${g.quelle}/${g.erf}`;
    if(Z.length>=2 && !Z.some(z=>z.k.passungGueltig) && Z.some(z=>z.k.mehrdeutig!=null))
      H.push(`${name}: Passung in keinem Lauf eindeutig (Mehrd. ${Z.map(z=>f2(z.k.mehrdeutig)).join('/')}) – IoU, Ecken, Wände gefunden und Beob Median fehlen in der Steigung, nur Strukturzahlen.`);
    const S=new Set(Z.map(z=>Object.values(z.k.stufen).join('/')));
    if(Z.length>=2 && S.size===1) H.push(`${name}: Stufen bei allen Faktoren gleich (${[...S][0]}) – hier kein Sichtfeld-Maß für die Verbindung der Abschnitte.`); }
  const ohneH=[...new Set(zeilen.filter(z=>z.k && !z.fehler && z.k.hLaser==null).map(z=>z.aufnahme))];
  if(ohneH.length) H.push(`ohne Laser-H: ${ohneH.join(', ')} (Protokoll ohne hLaserMm und kein --H; für die Wohnküche --H 2.416).`);
  return H;
}

// ------------------------------------------------ Tabelle
export function tabelleMd(zeilen, st, kopf={}){
  const L=['# Ablation Sichtfeld (Doku 12.7, Hebel (d))', ''];
  if(kopf.text) L.push(kopf.text, '');
  const H=hinweiseMd(zeilen, st); if(H.length) L.push('Vorab:', ...H.map(h=>'- '+h), '');
  const K=['Aufnahme', 'Quelle', 'Erf', 'f', 'wirksam', 'w\' px', 'hFOV °', 'H m', 'Abschn.', 'verb/lock/lose/lokal', 'nachreg./Kette', 'Wände glob.', 'Wände lokal',
    'geteilt alle/Seg', 'Anteil geteilt alle/Seg', 'geteilt Seg je 1000 Seg-Beob', 'Seg-Beob', 'Erf-Beob', 'Erf-Enden außerhalb', 'Export', 'Ecken', 'IoU', 'Ecken Median cm', 'Wände gef.',
    'Fläche m²', 'Beob Median cm', 'Mehrd.', 'Lauf s', 'Fehler'];
  const zeile=c=>'| '+c.join(' | ')+' |';
  L.push(zeile(K), '|'+'---|'.repeat(K.length));
  for(const z of zeilen){ const k=z.k;
    if(!k || z.fehler){ L.push(zeile([z.aufnahme, z.quelle, erfVon(z), z.faktor, ...Array(K.length-6).fill(''), f1(z.ms/1000),
      String(z.fehler || 'keine Kennzahlen').split('\n')[0].replace(/\|/g, '/').slice(0, 160)])); continue; }
    const s=k.stufen, es=k.erfSchnitt, kl=x=>k.passungGueltig ? x : '('+x+')';
    const erfAus=k.erfEnden==null || z.quelle==='segmente' ? '–' : k.erfEndenAussen+'/'+k.erfEnden+(es ? ` (geschnitten ${es.geschnitten}, weg ${es.weg})` : '');
    L.push(zeile([z.aufnahme, z.quelle, erfVon(z), z.faktor, f2(k.fEff), k.w2, f1(k.hfov), k.hLaser==null ? 'fehlt' : k.hLaser, k.abschnitte, `${s.verbunden}/${s.locker}/${s.lose}/${s.lokal}`,
      `${k.registriert ?? '–'}/${k.kette ?? '–'}`, k.waendeGlobal, k.waendeLokal, `${k.geteilt}/${k.geteiltSeg}`, `${f2(k.anteilGeteilt)}/${f2(k.anteilGeteiltSeg)}`, f1(k.geteiltSegJe1000),
      k.segBeob, k.erfBeob, erfAus, k.export ? 'ja' : 'nein', k.ecken, kl(f2(k.iou)), kl(cm(k.eckenMed)), kl(`${k.waendeGefunden ?? '–'}${k.waendeWahr!=null ? '/'+k.waendeWahr : ''}`),
      f1(k.flaeche), kl(cm(k.beobMed)), f2(k.mehrdeutig), f1(z.ms/1000), k.metrikFehler ? 'T2: '+k.metrikFehler : ''])); }
  L.push('', '## Steigung je 10° horizontales Sichtfeld (kleinste Quadrate über die Faktoren)', '',
    zeile(['Aufnahme', 'Quelle', 'Erf', 'n', ...STEIGUNG.map(([,t])=>t)]), '|'+'---|'.repeat(4+STEIGUNG.length));
  for(const g of st) L.push(zeile([g.aufnahme, g.quelle, g.erf, g.n, ...STEIGUNG.map(([k])=>{ const v=g.je10Grad[k]; if(!Number.isFinite(v)) return '–';
    const t=Math.abs(v)<5e-4 ? '0.000' : Math.abs(v)<10 ? v.toFixed(3) : v.toFixed(1); return g.nJe[k]<g.n ? `${t} (n ${g.nJe[k]})` : t; })]));
  L.push('', 'Lesart: positive Steigung heißt mehr bei weiterem Sichtfeld.',
    '- Absolutzahlen (geteilt abs., Wände global abs., Segment-Beob) wachsen mit der Zahl der Segmente, nicht mit der Verbindung; für die Verbindung stehen die Anteile (geteilte an allen globalen Wänden) und „geteilt Seg je 1000 Seg-Beob“.',
    '- Geteilte Wände = globale Wände mit Beob aus ≥ 2 Abschnitten (nicht das Maß „0–8 % Wandlänge“ aus 12.5).',
    '- * und Werte in Klammern hängen an der Lage aus T2: nur bei eindeutiger Passung (Mehrd. ≥ 1,2, gültiger Maßstab) in der Steigung; „(n k)“ = Zahl der Läufe, wenn kleiner als n. Die Fläche ist die des Exports selbst (T2 passt starr, s = 1).',
    '- Erf lassen: Erfassungen bleiben bei jedem Faktor alle drin (auch mit Enden außerhalb des Ausschnitts); die Referenz „erfassungen“ ist bei kleinem f darum optimistisch, und in „beide“ geben sie die Stufen vor: die Steigung ist dort eine Untergrenze. Erf schneiden: Erfassungen wie die engere Kamera (T1 --sichtfeld-erf schneiden), f = 1 aus „lassen“.',
    '- nachreg./Kette: Abschnitte, die über ihre Erfassungen nachregistriert sind (Hinweis abschnitt-registriert, 19.2 Z13) bzw. nur über die Kette hängen (abschnitt-kette).', '');
  return L.join('\n');
}

// ------------------------------------------------ ein Lauf (Kindprozess)
// T1-Argumente eines Auftrags; auch der Schluessel, mit dem --weiter eine fertige kennzahlen.json wiedererkennt.
export function t1Argv(auftrag){
  return [auftrag.src, ...(auftrag.protokoll ? ['--protokoll', auftrag.protokoll] : []), ...(auftrag.H===null ? ['--ohneH'] : Number.isFinite(auftrag.H) ? ['--H', String(auftrag.H)] : []),
    '--quelle', auftrag.quelle, '--sichtfeld', String(auftrag.faktor), ...(auftrag.erf==='schneiden' ? ['--sichtfeld-erf', 'schneiden'] : []),
    ...(auftrag.ohne && auftrag.ohne.length ? ['--ohne', auftrag.ohne.join(',')] : []), ...(auftrag.t1||[])];
}
// auftrag: {id, aufnahme, src, protokoll, wahrheit, H, quelle, erf, faktor, ohne:[...], t1:[...], dir}. Schreibt dir/kennzahlen.json
// (auch bei Ausnahme, dann mit fehler) und die Ausgaben wie T1 --aus (ohne karte.jsonl und ergebnis.json).
export async function einzelLauf(auftrag){
  const t0=performance.now(), d=resolve(auftrag.dir); mkdirSync(d, {recursive:true});
  const argv=t1Argv(auftrag), kopf={id:auftrag.id, aufnahme:auftrag.aufnahme, quelle:auftrag.quelle, faktor:auftrag.faktor, erf:auftrag.erf || 'lassen', version:VERSION,
    wahrheit:auftrag.wahrheit || null, argv};
  try{
    const a=T1.argumente(argv), o=T1.optionenAus(a), {G, quellen, herkunft, pruef}=await T1.ladeSeite({});
    const A=T1.ladeQuelle(resolve(auftrag.src), {protokoll:auftrag.protokoll ? resolve(auftrag.protokoll) : null}), wahrheit=auftrag.wahrheit ? resolve(auftrag.wahrheit) : null;
    if(o.orakelRahmen) o.orakel=T1.orakelAus(G, A, o, wahrheit);
    const tL=performance.now(), lauf=await T1.laufen(G, A, o), msLauf=performance.now()-tL; lauf.quelleName=basename(auftrag.src);
    let m=null; const tM=performance.now();
    // wie T1 main: --metrik export laesst die Beob weg (T2 passt dann nur den Export; schneller, ohne beobMed), aus: keine T2
    if(wahrheit && o.metrik!=='aus'){ const E=T1.metrikEingabe(lauf); if(o.metrik==='export') delete E.beob;
      m=T2.metrik(E, wahrheit, {hFest:lauf.hLaser || 2.416, wahrheitGespiegelt:o.spiegel==='ja' ? true : null}); }
    const msM=performance.now()-tM, k=kennzahlen(lauf, m);
    writeFileSync(join(d, 'bericht.txt'), T1.bericht(lauf, m, null, herkunft, quellen, pruef)+`\nZeit: Lauf ${(msLauf/1000).toFixed(1)} s, T2 ${(msM/1000).toFixed(1)} s (Mac, Node ${process.version})\n`);
    writeFileSync(join(d, 'export.json'), JSON.stringify(lauf.teilen));
    writeFileSync(join(d, 'plan.svg'), T1.planSvg(lauf, m, wahrheit));
    const z={...kopf, k, ms:{lauf:msLauf, metrik:msM, gesamt:performance.now()-t0}, fehler:null};
    schreibeJson(join(d, 'kennzahlen.json'), z);
    return z;
  }catch(e){ const z={...kopf, k:null, ms:{gesamt:performance.now()-t0}, fehler:e.stack || String(e)}; schreibeJson(join(d, 'kennzahlen.json'), z); return z; }
}

// ------------------------------------------------ alle Laeufe
export function auftraege(o){
  const L=[];
  for(const au of o.aufnahmen) for(const quelle of o.quellen) for(const erf of o.erf || DEF.erf) for(const faktor of o.faktoren){
    // schneiden aendert nur Erfassungen und nur mit Fenster: nicht fuer 'segmente' (speist keine ein) und nicht bei f = 1
    if(erf==='schneiden' && (quelle==='segmente' || faktor===1)) continue;
    const id=`${au.name}-${quelle}-f${faktor}${erf==='schneiden' ? '-erfS' : ''}`;
    L.push({id, aufnahme:au.name, src:resolve(au.src), protokoll:au.protokoll ? resolve(au.protokoll) : null, wahrheit:o.wahrheit ? resolve(o.wahrheit) : null, H:o.H,
      quelle, erf, faktor, ohne:o.ohne, t1:o.t1, dir:join(resolve(o.aus), 'laeufe', id)}); }
  return L;
}
// Grob die teuren Laeufe zuerst (Video-Bytes, Faktor; 'erfassungen' dekodiert kein Video), damit --jobs gut ausgelastet ist.
const kosten=a=>{ let s=1; try{ s=statSync(a.src).size; }catch(e){} return s*(a.quelle==='erfassungen' ? 0.05 : 0.3+0.7*a.faktor); };
// Ein Lauf in einem eigenen Prozess. Die alte kennzahlen.json geht vorher weg (sonst laese ein abgestuerzter Lauf die vom
// letzten Mal); fertig() genau einmal ('error' und 'exit' koennen beide kommen, ein zweites closeSync wuerfe EBADF im
// Eventhandler und beendete das Werkzeug); nach zeitgrenzeS SIGKILL und eine Fehlerzeile.
export function kind(auftrag, zeitgrenzeS=DEF.zeitgrenze){
  return new Promise(res=>{ const t0=performance.now(); mkdirSync(auftrag.dir, {recursive:true});
    const datei=join(auftrag.dir, 'auftrag.json'), kz=join(auftrag.dir, 'kennzahlen.json'); writeFileSync(datei, JSON.stringify(auftrag, null, 1)); rmSync(kz, {force:true});
    const log=openSync(join(auftrag.dir, 'log.txt'), 'w');
    const p=spawn(process.execPath, [fileURLToPath(import.meta.url), '--lauf', datei], {stdio:['ignore', log, log]});
    let schon=false, zeitUm=false;
    const uhr=zeitgrenzeS>0 && Number.isFinite(zeitgrenzeS) ? setTimeout(()=>{ zeitUm=true; p.kill('SIGKILL'); }, zeitgrenzeS*1000) : null;
    const fertig=(code, fehlerStart)=>{ if(schon) return; schon=true; if(uhr) clearTimeout(uhr); closeSync(log);
      const ms=performance.now()-t0; let z=null; try{ z=existsSync(kz) ? leseJson(kz) : null; }catch(e){ z=null; }
      if(!z){ let rest=''; try{ rest=readFileSync(join(auftrag.dir, 'log.txt'), 'utf8').trim().split('\n').slice(-3).join(' / '); }catch(e){}
        z={id:auftrag.id, aufnahme:auftrag.aufnahme, quelle:auftrag.quelle, faktor:auftrag.faktor, erf:auftrag.erf || 'lassen', k:null,
          fehler:zeitUm ? `Zeitgrenze ${zeitgrenzeS} s überschritten, Kindprozess mit SIGKILL beendet` : fehlerStart || `Kindprozess Code ${code}, keine kennzahlen.json: ${rest}`}; }
      res({...z, msKind:z.ms, ms}); };
    p.on('error', e=>fertig(-1, 'Start: '+e.message)); p.on('exit', code=>fertig(code, null)); });
}
export async function ablation(o0){
  const o={...DEF, ...o0}, aus=resolve(o.aus); mkdirSync(join(aus, 'laeufe'), {recursive:true});
  const A=auftraege(o), zeilen=new Array(A.length), reihe=A.map((a,i)=>i).sort((i,j)=>kosten(A[j])-kosten(A[i]));
  // --weiter/--nur-tabelle: eine fertige kennzahlen.json nur bei gleicher Version, gleichen T1-Argumenten und gleicher Wahrheit
  const alt=i=>{ const kz=join(A[i].dir, 'kennzahlen.json'); if(!existsSync(kz)) return null; let z; try{ z=leseJson(kz); }catch(e){ return null; } if(z.fehler) return null;
    const grund=z.version!==VERSION ? `Version ${z.version ?? 1} statt ${VERSION}` : JSON.stringify(z.argv)!==JSON.stringify(t1Argv(A[i])) ? 'andere T1-Argumente'
      : (z.wahrheit ?? null)!==(A[i].wahrheit ?? null) ? 'andere Wahrheit' : null;
    return grund ? {veraltet:grund} : {...z, msKind:z.ms, ms:z.ms ? z.ms.gesamt : NaN}; };
  let next=0, n=0; const tA=performance.now();
  const arbeiter=async()=>{ while(next<reihe.length){ const i=reihe[next++], a=A[i];
    const vorher=o.weiter || o.nurTabelle ? alt(i) : null, gilt=!!vorher && !vorher.veraltet;
    zeilen[i]=gilt ? vorher : o.nurTabelle ? {id:a.id, aufnahme:a.aufnahme, quelle:a.quelle, faktor:a.faktor, erf:a.erf, k:null, ms:NaN,
      fehler:vorher ? `kennzahlen.json veraltet (${vorher.veraltet}), ohne --nur-tabelle neu rechnen` : 'nicht gerechnet'} : await kind(a, o.zeitgrenze);
    n++; if(!o.still) console.log(`[${n}/${A.length}] ${a.id}: ${zeilen[i].fehler ? 'FEHLER '+String(zeilen[i].fehler).split('\n')[0] : 'ok'} (${f1(zeilen[i].ms/1000)} s${gilt ? ', aus --weiter' : vorher ? ', neu: '+vorher.veraltet : ''})`); } };
  await Promise.all(Array.from({length:Math.max(1, Math.min(o.jobs|0 || 1, A.length))}, arbeiter));
  const st=steigungen(zeilen), msGesamt=performance.now()-tA;
  const text=`Werkzeug raumskizze-ablation.mjs v${VERSION}, T1 v${T1.VERSION}, Node ${process.version}; ${A.length} Läufe, --jobs ${o.jobs}, Zeitgrenze ${o.zeitgrenze} s, gesamt ${f1(msGesamt/1000)} s. `
    +`Faktoren ${o.faktoren.join(', ')}, Quellen ${o.quellen.join(', ')}, Erf ${o.erf.join(', ')}, --ohne ${o.ohne.join(',') || '–'}, `
    +`H ${o.H===null ? 'aus (--ohneH)' : Number.isFinite(o.H) ? o.H : 'aus Protokoll'}${o.t1.length ? ', T1 '+o.t1.join(' ') : ''}. `
    +`Aufnahmen: ${o.aufnahmen.map(a=>a.name+' = '+basename(a.src)).join(', ')}.`;
  const md=tabelleMd(zeilen, st, {text});
  writeFileSync(join(aus, 'ablation.md'), md);
  schreibeJson(join(aus, 'ablation.json'), {kopf:{werkzeug:'raumskizze-ablation.mjs', version:VERSION, t1:T1.VERSION, node:process.version, optionen:{...o, aus}, msGesamt},
    zeilen:zeilen.map(z=>({...z})), steigungen:st});
  return {zeilen, steigungen:st, md, msGesamt};
}

// ------------------------------------------------ Kommandozeile
// Eigene Auswertung, weil --aufnahme mehrfach vorkommt (T1.argumente behaelt nur den letzten Wert).
export function argumente(argv){
  const a={aufnahmen:[]}, BOOL=new Set(['weiter', 'nur-tabelle', 'still', 'ohneH']);
  for(let i=0;i<argv.length;i++){ const x=argv[i]; if(!x.startsWith('--')) throw new Error('unerwartetes Argument '+x);
    let [k, v]=x.slice(2).split(/=(.*)/s); if(v===undefined && !BOOL.has(k)) v=argv[++i]; if(BOOL.has(k) && v===undefined) v=true;
    if(k==='aufnahme'){ const m=String(v).match(/^([^=]+)=(.+)$/); if(!m) throw new Error('--aufnahme Name=Quelle[,Protokoll], nicht '+v);
      const [src, protokoll]=m[2].split(','); a.aufnahmen.push({name:m[1], src, protokoll:protokoll || null}); }
    else a[k]=v; }
  const liste=v=>v==null ? null : String(v).split(',').map(s=>s.trim()).filter(Boolean);
  return {aufnahmen:a.aufnahmen, aus:a.aus, wahrheit:a.wahrheit || (existsSync(T1.WAHRHEIT) ? T1.WAHRHEIT : null), H:a.ohneH ? null : a.H!=null ? +a.H : DEF.H,
    faktoren:liste(a.faktoren)?.map(Number) || DEF.faktoren, quellen:liste(a.quellen) || DEF.quellen, ohne:a.ohne!=null ? liste(a.ohne) : DEF.ohne, erf:liste(a.erf) || DEF.erf,
    jobs:a.jobs!=null ? +a.jobs : DEF.jobs, zeitgrenze:a.zeitgrenze!=null ? +a.zeitgrenze : DEF.zeitgrenze, t1:a.t1 ? String(a.t1).split(/\s+/).filter(Boolean) : [],
    weiter:!!a.weiter, nurTabelle:!!a['nur-tabelle'], still:!!a.still, lauf:a.lauf || null};
}
async function main(){
  const o=argumente(process.argv.slice(2));
  if(o.lauf){ const z=await einzelLauf(leseJson(resolve(o.lauf))); if(z.fehler){ console.error(z.fehler); process.exitCode=1; } else console.log(`${z.id}: ok, ${(z.ms.gesamt/1000).toFixed(1)} s`); return; }
  if(!o.aufnahmen.length || !o.aus){ console.error('Aufruf: node raumskizze-ablation.mjs --aufnahme A8=aufnahme8.tar,protokoll8.json [--aufnahme ...] --aus ordner [--H 2.416] [--faktoren 1,0.8,0.6,0.4] [--quellen segmente,beide,erfassungen] [--erf lassen,schneiden] [--jobs n] ...'); process.exit(1); }
  for(const f of o.faktoren) if(!(f>0 && f<=1)) throw new Error('--faktoren: 0 < f <= 1, nicht '+f);
  for(const e of o.erf) if(!['lassen', 'schneiden'].includes(e)) throw new Error('--erf lassen,schneiden, nicht '+e);
  if(o.H!=null && !(o.H>0)) throw new Error('--H: Hoehe in m, nicht '+o.H);
  for(const au of o.aufnahmen) if(!existsSync(au.src)) throw new Error(`${au.name}: ${au.src} fehlt`);
  const r=await ablation(o);
  console.log('\n'+r.md);
  console.log(`Ausgabe: ${resolve(o.aus)}/{ablation.md, ablation.json, laeufe/}`);
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) main().catch(e=>{ console.error(e.stack || e.message); process.exit(1); });
