// raum-kueche.js – Rechenkern des Küchenplaners: Teile, Lage an der Wand,
// Prüfungen, Wege, Stückliste, Szene für 3D (docs/adr/0001-familie-mit-geteilten-js-dateien.md).
// DOM-frei, läuft in node test/run.mjs wie im Browser. Unverändert aus dem
// früheren Block "kitchen" von raumaufmass.html; legt globalThis.KITCHEN an.
// Braucht: raum-kern.js (CORE, escapeHtml), raum-fliesen.js (TILES) und, erst
// beim Aufruf, raum-geometrie.js (wallShape, ceilingAt, ceilingMin, doorSwing).
// Auch das Raumaufmaß lädt sie: Küchendaten bleiben am Raum (raum-modell.js).
"use strict";
// ================= Küche: Modell, Geometrie, Prüfung, Wege =================
// DOM-frei, damit node test/run.mjs alles hier prüfen kann. Die UI
// (kitchen-ui) zeichnet nur, was hier gerechnet wird.
//
// Verankerung wie bei den Öffnungen: Ein Schrank an der Wand speichert
// Wandecken a,b und x = Abstand seiner Kante von Ecke a entlang a->b (mm).
// So überlebt er jedes Nachmessen. Freie Teile (Tisch, Insel) liegen im
// Raumrahmen (TILES.frameOf) wie die Fliesen.
//
// Maße (mm), Quellen:
//   nobilia Typenliste 2026 (Korpus 720, Seitentiefe 561, Sockel 150,
//   Hängeschrank 720/350, Hochschrank 2016…2232, Breitenraster 150…1200);
//   Neff Planung (Arbeitsplatte 600, Sockel-Rücksprung 50); NKBA Kitchen
//   Planning Guidelines 2022 (Gänge, Tisch-Freiraum, Arbeitsdreieck,
//   Abstellflächen); Blum Dynamic Space (Zonen, Auszüge unten);
//   BSH-Maßblätter (Geschirrspüler offen 1150–1200 ab Rückwand).
(()=>{
const C=globalThis.CORE, TL=globalThis.TILES;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), add=(a,b)=>({x:a.x+b.x,y:a.y+b.y}), mul=(a,k)=>({x:a.x*k,y:a.y*k});
const dot=(a,b)=>a.x*b.x+a.y*b.y, crs=(a,b)=>a.x*b.y-a.y*b.x, len=v=>Math.hypot(v.x,v.y);
const unit=v=>{ const l=len(v)||1; return {x:v.x/l,y:v.y/l}; };
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fin=v=>typeof v==='number' && isFinite(v);
const mm=v=>Math.round(v);

// ---------- Standardmaße ----------
// Tiefen MIT Front (Korpus 561 + Front 19). Arbeitsplatte 600 steht 20 vor.
const K_DEF={ plinth:150, baseH:720, baseD:580, topT:40, topD:600,
              wallH:720, wallD:370, tallH:2016, tallD:580, faucetH:250,
              // Wie viele kochen gleichzeitig (Meldung M-20261109-151540-54f941):
              // ab 2 gilt der NKBA-Gang für mehrere Köche (48″ = 1219 mm).
              persons:1 };
const K_LIM={ plinth:[0,300], baseH:[300,1200], baseD:[250,900], topT:[10,120], topD:[300,1200],
              wallH:[200,1400], wallD:[150,700], tallH:[1000,2800], tallD:[250,900], faucetH:[0,600], persons:[1,3] };
// Arbeitshöhe = Sockel + Korpus + Platte; Hängeschränke schließen oben
// bündig mit dem Hochschrank ab (eine Frontlinie), Unterkante folgt daraus.
// Nie unter dem Boden: normSpec klemmt jedes Maß einzeln, aber Hochschrank
// 1000 mit Hängeschrank 1400 (beides in K_LIM) ergäbe −400. Dann steht der
// Hängeschrank auf dem Boden und ragt über den Hochschrank hinaus.
function derived(S){
  const workH=S.plinth+S.baseH+S.topT, tallTop=S.plinth+S.tallH;
  return {workH, tallTop, wallZ:Math.max(0, tallTop-S.wallH)};
}
// Breitenraster (nobilia 10er plus 15er-Raster); Geräte haben eigene.
const WIDTHS=[150,200,300,400,450,500,600,800,900,1000,1200];
const KIND={
  base:  {label:'Unterschrank', band:'low',  free:false},
  wall:  {label:'Hängeschrank', band:'high', free:false},
  tall:  {label:'Hochschrank',  band:'full', free:false},
  island:{label:'Insel',        band:'low',  free:true},
  table: {label:'Tisch',        band:'low',  free:true},
};
const DEV={
  sink:  {label:'Spüle',          kinds:['base','island'], widths:[450,500,600,800,900,1000,1200]},
  // Spülmaschine auch im Hochschrank auf Hüfthöhe (Meldung
  // M-20261109-150300-1cb61f), Lage siehe devZ.
  dw:    {label:'Spülmaschine',   kinds:['base','tall'], widths:[450,600]},
  hob:   {label:'Herd',           kinds:['base','island'], widths:[600,800,900]},
  fridge:{label:'Kühlschrank',    kinds:['tall'], widths:[600]},
  freezer:{label:'Gefrierschrank', kinds:['tall'], widths:[600]},
  oven:  {label:'Backofen hoch',  kinds:['tall'], widths:[600]},
  mw:    {label:'Mikrowelle',     kinds:['tall'], widths:[600]},
  hood:  {label:'Dunstabzug',     kinds:['wall'], widths:[600,900]},
};
// Frei stehende Kühlschränke mit zwei Flügeltüren (Bauform it.fz; ohne fz
// ist es der Einbau-Kühlschrank im Hochschrank wie bisher). Maße aus den
// Bosch-Maßblättern KFF96PIEP (French Door: 905 × 706 × 1830, Korpus 610,
// Tür 96, Türen 118° auf, Schubladen darunter ab ≈ 700; die Zeichnung misst
// ab Wand mit 25 mm Abstandshaltern: 635/731) und KAN93VIFP (Side by Side:
// 908 × 708 × 1787, Korpus 629, Tür 79, Türen 387/515, 130°/135° auf); Breiten
// French Door nach Haier 70/83/90/100 cm. d = Tiefe MIT Tür (wie im
// Datenblatt), Korpus = d − Türdicke. full = Öffnungswinkel, ab dem sich
// Fächer und Schubladen herausnehmen lassen (Bosch: „Schubladen ausziehbar
// bei 90°, herausnehmbar bei vollständig geöffneter Tür“).
// Freistehend (eine Tür, Anschlag wählbar, beim Kühlschrank wahlweise mit
// Gefrierteil unten; Meldung M-20261109-140322-42075e): Bosch KSV36 /
// KGN36 (600 × 650…665 × 1860), Tür mit Fächern ≈ 70 dick, Gefrierteil
// unten ≈ 700 hoch. Ganz offen 115° ist eine Annahme (übliche Bänder ohne
// Türstopp, kein Maßblatt dazu). devs: für welche Geräte die Bauform gilt.
const FRIDGE={
  free:{label:'Freistehend', devs:['fridge','freezer'], single:true, widths:[550,600,700], d:660, h:1860, doorT:70, full:115, gfZ:700},
  fd: {label:'French Door',  devs:['fridge'], widths:[700,830,900,1000], d:706, h:1830, doorT:96, full:118, split:0.5, drawerZ:700,
       leaves:['linker Flügel','rechter Flügel']},
  sbs:{label:'Side by Side', devs:['fridge'], widths:[900,910], d:708, h:1787, doorT:79, full:130, split:0.43,
       leaves:['Gefrierteil (links)','Kühlteil (rechts)']},
};
const DOORT_LIM=[30,150];
// Einbau-Kühlschrank: bis wohin die Tür aufgehen soll. 90° reicht zum
// Hineingreifen; Gemüseschalen und Abstellfächer herausnehmen geht oft erst
// darüber (Bosch: „Schubladen ausziehbar bei 90°, herausnehmbar bei
// vollständig geöffneter Tür“), üblich sind um 115–120°. Beides ist wählbar,
// damit man den Kompromiss sieht (Meldung M-20261109-135752-e60089).
// Ohne Angabe 90° wie bisher; neue Kühlschränke aus der Leiste 120°.
const SWINGS=[90,120];
// Kühl- und Gefriergeräte verhalten sich gleich: eine Tür, Angel wählbar.
const COLD=new Set(['fridge','freezer']);
const isCold=it=>!!it && COLD.has(it.dev);
const swingOf=it=>it && isCold(it) && !fzOf(it) && SWINGS.includes(it.swing) ? it.swing : 90;
const fzOf=it=>it && it.kind==='tall' && FRIDGE[it.fz] && FRIDGE[it.fz].devs.includes(it.dev) ? FRIDGE[it.fz] : null;
const doorTOf=it=>{ const f=fzOf(it); return !f ? 0 : it.doorT!=null ? it.doorT : f.doorT; };
// Passblende an Innenecken: Griffe und Fronten stoßen sonst aneinander.
const PASS=50;
// Geräte im Hochschrank: Unterkante des Geräts. Backofen: Tür offen knapp
// unter Arbeitshöhe (wie bisher). Spülmaschine hoch eingebaut (Meldung
// M-20261109-150300-1cb61f): EIGENE ANNAHME 400 mm unter Arbeitshöhe, dann
// liegt der Unterkorb offen auf Hüfthöhe und der Oberkorb unter Augenhöhe;
// Gerätehöhe 815 (Bosch SMV4EUX00D: „Gerätehöhe 81,5 cm“).
const DW_H=815, DW_DROP=400;
// Backofen: Gerätehöhe 600 (Einbaunische 585–600). Mikrowelle: Nische 380
// auf Augenhöhe (Arbeitshöhe + 420), höchstens 500 unter der Oberkante.
const DEV_H={dw:DW_H, oven:600, mw:380};
// Hochschrank mit eingebautem Gerät: hohe Spülmaschine, Backofen, Mikrowelle.
const tallDev=it=>!!it && it.kind==='tall' && DEV_H[it.dev]!=null;
function devZ(it, S){
  const D=derived(S);
  if(it.dev==='dw' && it.kind==='tall') return Math.max(S.plinth+300, D.workH-DW_DROP);
  if(it.dev==='oven') return Math.max(S.plinth+300, D.workH-60);
  if(it.dev==='mw' && it.kind==='tall'){
    const z1=it.h!=null ? it.h : D.tallTop;
    return Math.max(S.plinth+300, Math.min(z1-500, D.workH+420));
  }
  return null;
}
// Höhenaufteilung eines Hochschranks mit Gerät, EINE Quelle für Fronten
// (frontsOf), Hüllen (envelopes), Fächer (devZones) und Prüfung (check):
// Schranktür z0–zd, Gerät zd–zt, Schranktür zt–z1. need: so hoch muss der
// Schrank mindestens sein, damit das Gerät hineinpasst.
function devSegs(it, S){
  if(!tallDev(it)) return null;
  S=S||K_DEF;
  const z0=S.plinth, z1=it.h!=null ? it.h : derived(S).tallTop, dz=devZ(it,S), need=dz+DEV_H[it.dev];
  const zd=Math.min(dz, z1), zt=Math.min(need, z1);
  return {z0, zd, zt, z1, need, fits: z1>=need};
}
// Fächer im Hochschrank mit Gerät (Meldung M-20261109-161527-05b8cd, für
// Backofen und Mikrowelle übernommen): unter dem Gerät (Sockel bis Gerät,
// wegen devZ immer ≥ 300 mm) und darüber (Gerät bis Schrankoberkante) Platz
// für Vorräte, Geschirr usw. Ein oberes Fach unter DW_ZONE_MIN zählt nicht
// (Blende). Passt das Gerät nicht in den Schrank: kein Fach.
const DW_ZONE_MIN=250;
// EIGENE ANNAHME: Ein unteres Fach, das nicht über 600 mm reicht, liegt
// knapp über dem Boden (Bücken, NKBA greift Häufiges erst ab 38 cm) – dort
// nur Untenzeug. So bei der hohen Spülmaschine (Fach bis ≈ 510); unter
// Backofen (bis ≈ 850) und Mikrowelle (bis ≈ 1330) ist es ein normales Fach
// wie im Unterschrank.
const LOW_ZONE_TOP=600;
function devZones(it, S){
  const sg=devSegs(it,S); if(!sg || !sg.fits) return [];
  const lo={key:'unten', z0:sg.z0, z1:sg.zd}; if(sg.zd<=LOW_ZONE_TOP) lo.only=DW_LOW;
  const out=[lo];
  if(sg.z1-sg.zt>=DW_ZONE_MIN) out.push({key:'oben', z0:sg.zt, z1:sg.z1});
  return out;
}
const dwZones=devZones;                        // alter Name (Selbsttest, Panel)
// Ins niedrige untere Fach gehört nur, was man selten oder schwer greift.
const DW_LOW=['toepfe','vorrat','backen','putz'];
// Greifhöhe → Gewicht (NKBA 38–122 cm für Häufiges, Blum-Ebenen).
const zReach=z=>z>=750 && z<=1450 ? 1 : (z>=400 && z<750) || (z>1450 && z<=1750) ? 1.3 : 2;
// Wie oft ein Inhalt in den Abläufen gebraucht wird (Gänge je Woche, Rückweg
// doppelt) – dieselbe Rechnung wie beim optimalen Einräumen.
const USE_MEMO=new Map();
function contentUse(k){
  if(!USE_MEMO.has(k)) USE_MEMO.set(k, FLOWS.reduce((s,F)=>s+(F.chains.flat().includes(k) ? F.f*(F.back?2:1) : 0),0));
  return USE_MEMO.get(k);
}
// Was in der Belegung a ({inhalt:[ids]}) im Schrank id liegt.
const heldIn=(a,id)=>Object.keys(a).filter(k=>a[k].includes(id));
// In welchem Fach ein Inhalt für die Wege liegt. Allein: Untenzeug unten, sonst
// das besser greifbare Fach, das ihn nimmt (Spülmaschine: oben, Backofen und
// Mikrowelle: unten). Liegen mehrere im Schrank (list, sonst it.store), hat
// jeder ein eigenes Fach wie in storeFits: wollen zwei dasselbe, bekommt der
// häufiger gebrauchte das besser greifbare (EIGENE ANNAHME; gleichauf der
// frühere in CONTENTS), der andere das übrige – gleich für jede Reihenfolge
// der Liste. Passt die Liste nicht (zu viele, falsches Fach), zählt jeder
// Inhalt allein. null, wenn es kein Fach gibt.
function dwZoneFor(it, S, c, list){
  const all=devZones(it,S); if(!all.length) return null;
  const ok=(k,z)=>!z.only || z.only.includes(k), m=z=>zReach((z.z0+z.z1)/2);
  const solo=k=>{
    const Z=all.filter(z=>ok(k,z));
    if(Z.length<2) return Z[0] || all[0];
    if(DW_LOW.includes(k)) return Z[0];
    return m(Z[1])<m(Z[0]) ? Z[1] : m(Z[0])<m(Z[1]) ? Z[0] : Z[1];
  };
  const had=list || it.store || [], ks=had.includes(c) ? had : [...had, c];
  if(ks.length<2 || !storeFits(it,S,ks)) return solo(c);
  // storeFits: höchstens zwei Inhalte in zwei Fächern.
  const [a,b]=ks, za=solo(a), zb=solo(b);
  if(za!==zb) return c===a ? za : zb;                    // jeder in sein Fach
  const idx=k=>CONTENTS.findIndex(x=>x.key===k);
  const [hi,lo]=[a,b].sort((p,q)=>contentUse(q)-contentUse(p) || idx(p)-idx(q));
  const [best,worst]=m(all[1])<m(all[0]) ? [all[1],all[0]] : [all[0],all[1]];
  const zHi=ok(hi,best) && ok(lo,worst) ? best : worst;
  return c===hi ? zHi : zHi===best ? worst : best;
}
// Greifhöhe eines Umsortierens (Umzüge moves, Belegung vorher start, nachher
// cur): Gewicht im Zielschrank nachher minus im Herkunftsschrank vorher. Das
// Fach im Hochschrank mit Gerät folgt aus allem, was dort in der jeweiligen
// Belegung liegt.
function reachDelta(K, L, moves, start, cur){
  const reach=(id,c,asg)=>{ const g=L.byId.get(id); return reachFactor(K, g, g && dwZoneFor(g.it,K.spec,c,heldIn(asg,id))); };
  return moves.filter(m=>!m.place).reduce((a,m)=>a+reach(m.to,m.c,cur)-reach(m.from,m.c,start),0);
}
// Passt diese Liste von Inhalten in den Schrank? Normal: höchstens storeCap.
// Hochschrank mit Gerät: je Fach ein Inhalt, und jeder in ein Fach, das ihn
// nimmt (Zuordnung Inhalt→Fach; bei höchstens zwei Fächern reicht Durchprobieren).
function storeFits(it, S, list){
  if(!tallDev(it)) return list.length<=storeCap(it,S);
  const Z=devZones(it,S), ok=(c,z)=>!z.only || z.only.includes(c);
  if(list.length>Z.length) return false;
  if(list.length<=1) return list.every(c=>Z.some(z=>ok(c,z)));
  return (ok(list[0],Z[0]) && ok(list[1],Z[1])) || (ok(list[0],Z[1]) && ok(list[1],Z[0]));
}
// Herd = Kochfeld mit Backofen darunter; noOven: nur Kochfeld, darunter
// Schubladen (Meldung M-20261109-150755-4f921c, Backofen dann im Hochschrank).
const ovenBelow=it=>it.dev==='hob' && it.kind==='base' && !it.noOven;
// Herd: Unterkante der Backofentür. Der Ofen (DEV_H.oven) sitzt unter der
// Platte, darunter bleibt eine flache Lade von mindestens OVEN_LOW (bei den
// Standardmaßen genau diese 120 mm). EINE Quelle für Front (frontsOf) und
// Prüfhülle (envelopes), wie devSegs beim Hochschrank.
const OVEN_LOW=120;
const ovenZ=(z0,z1)=>Math.max(z0+OVEN_LOW, z1-DEV_H.oven);
// Schubladenfronten von unten nach oben: zwei hohe, OBEN die flache Lade
// (Besteck, Messer) – wie der Schubkasten im Eckschrank (nobilia UE: Auszug
// oben, Tür darunter). EINE Quelle für die Fronten (frontsOf) und die
// gezogene Lade (envelopes, „Fronten offen“).
const DRAWER_TOP=0.25;
// French Door: Anteil der unteren der beiden Gefrierladen unter den Flügeln.
const FD_LOW=0.45;
const FRONTS={ drawer:'Schubladen', door:'Drehtür', slide:'Schiebetür', flap:'Klappe', open:'offen' };
// Eckschränke (Meldung M-20261109-134919-c2a193: Konfigurator für Unter- und
// Hängeschrank). nobilia Typenliste 2026, Halbeckschränke: Korpus und Tür
// stehen im Typnamen (UE100-50 = Korpus 1000, Tür 500), der Rest ist Blende
// hinter der Querzeile. Planmaß quer 650 (630–750) unten, 450 (390–500)
// oben; längs = Planmaß quer + Tür. Unten UED (Einlegeboden), UE
// (Schubkasten + Tür), UEDSA (Schwenkauszug, 2 Holzschwenktablare); oben
// WE60-20, WE80-35, WE90-45 mit Einlegeboden.
// door fehlt = „passend“: Blende so breit wie Querzeile + Passblende.
const CORNER={
  base:{ bodies:[900,1000], doors:{900:[400,450], 1000:[500,600]}, plan:650, minDoor:300,
         inner:{boden:'Einlegeboden', schub:'Schubkasten + Tür', schwenk:'Schwenkauszug'}, type:{boden:'UED', schub:'UE', schwenk:'UEDSA'} },
  // Hänge-Eckschrank: Typname nennt 60/80/90, der Korpus misst 600/782/882.
  wall:{ bodies:[600,782,882], nominal:{600:60, 782:80, 882:90}, doors:{600:[200], 782:[350], 882:[450]}, plan:450, minDoor:150,
         inner:{boden:'Einlegeboden'}, type:{boden:'WE'} },
};
// Leiste oben nach Bedarf (Meldung M-20261109-140633-ca6d1f): kalt, warm,
// nass, Stauraum, dann Möbel. Je Bedarf ein Knopf; Bauform und Varianten
// wählt man danach rechts. pal:false = nicht in der Leiste (Import, Tests).
const PGROUPS=[['kalt','Kalt'],['warm','Warm'],['nass','Nass'],['stau','Stauraum'],['moebel','Möbel']];
// Über Eck (L) und Diagonal: ein Korpus in der Ecke mit zwei gleich langen
// Schenkeln (it.w), nobilia UE/UEK/UED 80/90 unten, WE 60/65/80/90 (2 Türen,
// 165°) und WED65 (diagonal, Tür 394) oben. Karussell nur unten über Eck.
const CSHAPE={
  base:{ L:{legs:[800,900], def:900, inner:{boden:'Einlegeboden', karussell:'Karussell'}, type:{boden:'UE', karussell:'UEK'}},
         diag:{legs:[800,900], def:900, inner:{boden:'Einlegeboden'}, type:{boden:'UED'}} },
  wall:{ L:{legs:[600,650,800,900], def:600, inner:{boden:'Einlegeboden'}, type:{boden:'WE'}},
         diag:{legs:[650], def:650, inner:{boden:'Einlegeboden'}, type:{boden:'WED'}} },
};
const shapeOf=it=>it.corner && it.ctype && CSHAPE[it.kind] ? CSHAPE[it.kind][it.ctype] : null;
const PRESETS=[
  // Stauraum (Meldung M-20261109-150551-fc7828): in der Leiste nur Schrank,
  // Eckschrank und Insel; unten, hängend oder hoch wählt man danach rechts
  // (Bauart). Hänge-/Hochschrank-Vorlagen bleiben für Import und Tests.
  {key:'base',  kind:'base', front:'drawer', w:600, grp:'stau', label:'Schrank'},
  {key:'sink',  kind:'base', dev:'sink', front:'door', w:600, store:['muell','putz'], grp:'nass', label:'Spüle'},
  {key:'dw',    kind:'base', dev:'dw', front:'door', w:600, grp:'nass', label:'Spülmaschine'},
  {key:'hob',   kind:'base', dev:'hob', front:'door', w:600, grp:'warm', label:'Herd'},
  {key:'corner',kind:'base', corner:true, front:'door', w:1000, grp:'stau', label:'Eckschrank'},
  {key:'wall',  kind:'wall', front:'door', w:600, grp:'stau', pal:false, label:'Hängeschrank'},
  {key:'wcorner',kind:'wall', corner:true, front:'door', w:782, door:350, grp:'stau', pal:false, label:'Eckhängeschrank'},
  {key:'hood',  kind:'wall', dev:'hood', front:'open', w:600, grp:'warm', label:'Dunstabzug'},
  {key:'tall',  kind:'tall', front:'door', w:600, grp:'stau', pal:false, label:'Hochschrank'},
  // Ein Kühlschrank in der Leiste: erst „ich brauche einen“, die Bauform
  // (Einbau, French Door, Side by Side) danach rechts (Meldung
  // M-20261109-135632-2bb48a).
  {key:'fridge',kind:'tall', dev:'fridge', front:'door', hinge:'right', swing:120, w:600, store:['kuehl'], grp:'kalt', label:'Kühlschrank'},
  {key:'freezer',kind:'tall', dev:'freezer', front:'door', hinge:'right', swing:120, w:600, grp:'kalt', label:'Gefrierschrank'},
  {key:'mw',    kind:'tall', dev:'mw', front:'door', w:600, grp:'warm', label:'Mikrowelle'},
  {key:'oven',  kind:'tall', dev:'oven', front:'door', w:600, grp:'warm', label:'Backofen im Hochschrank'},
  {key:'island',kind:'island', front:'drawer', w:1800, d:900, grp:'stau', label:'Insel'},
  {key:'table', kind:'table', w:1200, d:800, grp:'moebel', label:'Tisch'},
];

// ---------- Inhalte ----------
// Was wo gelagert wird (Blum Dynamic Space, Herstellerratgeber). Die Wege
// unten sagen, wohin es gebraucht wird; daraus folgt der beste Schrank.
const CONTENTS=[
  {key:'besteck', label:'Besteck'},
  {key:'teller',  label:'Teller, Schüsseln'},
  {key:'glaeser', label:'Gläser'},
  {key:'tassen',  label:'Tassen'},
  {key:'toepfe',  label:'Töpfe, Pfannen', low:true},
  {key:'messer',  label:'Messer, Bretter'},
  {key:'gewuerze',label:'Gewürze'},
  {key:'vorrat',  label:'Vorräte'},
  {key:'muell',   label:'Müll', low:true},
  {key:'putz',    label:'Putzmittel', low:true},
  {key:'backen',  label:'Backbleche, Seltenes'},
  {key:'kuehl',   label:'Kühlware', fixed:'fridge'},
];
const CKEY=new Set(CONTENTS.map(c=>c.key));
const CLABEL=Object.fromEntries(CONTENTS.map(c=>[c.key,c.label]));

// ---------- Abläufe (Wege) ----------
// Häufigkeit je Woche für einen 4-Personen-Haushalt: EIGENE ANNAHME (keine
// Primärquelle gefunden), kalibriert gegen das Laufweg-Band 75–189 km/Jahr
// (Mobiliar). Eine Kette ist eine Folge von Stationen; Stationen sind
// Geräte (sink, dw, hob, kuehl), der Tisch, der Eingang, die
// Vorbereitungsfläche (prep) oder ein Inhalt (Schrank, in dem er liegt).
const FLOWS=[
  {key:'einkauf',   group:'ein', label:'Einkauf einräumen', f:6, chains:[['eingang','kuehl','vorrat']]},
  {key:'muellraus', group:'ein', label:'Müll rausbringen', f:3, chains:[['muell','eingang']]},
  {key:'kochen',    group:'zub', label:'Kochen', f:7,
   chains:[['kuehl','prep','sink','prep','hob'],['vorrat','prep'],['messer','prep'],['toepfe','hob'],['gewuerze','hob']]},
  {key:'servieren', group:'zub', label:'Servieren', f:14, chains:[['hob','tisch']]},
  {key:'decken',    group:'aus', label:'Tisch decken', f:14, chains:[['teller','tisch'],['besteck','tisch'],['glaeser','tisch']]},
  {key:'abraeumen', group:'aus', label:'Abräumen in die Spülmaschine', f:21, chains:[['tisch','muell','dw']]},
  {key:'ausraeumen',group:'aus', label:'Spülmaschine ausräumen', f:5,
   chains:[['dw','teller'],['dw','besteck'],['dw','glaeser'],['dw','tassen'],['dw','toepfe']], back:true},
  {key:'kaffee',    group:'aus', label:'Kaffee, Getränke', f:14, chains:[['tassen','tisch'],['glaeser','kuehl','tisch']]},
  // Snacks (Meldung M-20261109-151457-68b975 nennt sie als eigene Aufgabe):
  // aus dem Kühlschrank auf die Arbeitsfläche, schneiden, an den Tisch.
  // Häufigkeit EIGENE ANNAHME wie Kochen.
  {key:'snack',     group:'zub', label:'Snack zubereiten', f:7, chains:[['kuehl','prep','tisch'],['messer','prep']]},
];
const GROUPS={ein:'Eingang', zub:'Zubereitung', aus:'Geschirr'};
const ROLE_LABEL={sink:'Spüle', dw:'Spülmaschine', hob:'Herd', kuehl:'Kühlschrank', tisch:'Tisch',
                  eingang:'Eingang', prep:'Arbeitsfläche', ...CLABEL};
// ---------- Normalisieren (Import tolerant, wie normTiles) ----------
// Schlüssel aus Dateien (kind, dev, front, fz, inner) nur gelten lassen, wenn
// die Tabelle ihn selbst hat: „toString“, „constructor“, „__proto__“ träfen
// sonst Object.prototype (wirft bei .kinds.includes, oder wird still übernommen).
const ownKey=(T,k)=>typeof k==='string' && Object.prototype.hasOwnProperty.call(T,k);
function normSpec(s){
  const o={...K_DEF};
  if(s && typeof s==='object'){
    for(const k of Object.keys(K_DEF)) if(fin(s[k])) o[k]=clamp(s[k], K_LIM[k][0], K_LIM[k][1]);
    // Zahl: Fremdimport mit numerischen Öffnungs-ids - deserialize macht
    // daraus mit den ids einen String (remapOpeningRefs).
    if(typeof s.entry==='string' || Number.isFinite(s.entry)) o.entry=s.entry;
  }
  return o;
}
// „Standard“ unter den Küchenmaßen: alle Maße aus K_DEF zurück. Personen
// bleibt, das ist eine Annahme der Analyse und kein Maß (dort einzustellen).
function specReset(S){
  Object.keys(K_DEF).forEach(k=>{ if(k!=='persons') S[k]=K_DEF[k]; });
  return S;
}
function normItem(o){
  if(!o || typeof o!=='object' || !ownKey(KIND,o.kind)) return null;
  const it={id:o.id, kind:o.kind};
  if(KIND[o.kind].free){
    if(!fin(o.x)||!fin(o.y)) return null;
    it.x=o.x; it.y=o.y; it.rot=fin(o.rot)?o.rot:0;
  } else {
    if(typeof o.a!=='string' || typeof o.b!=='string' || o.a===o.b || !fin(o.x)) return null;
    it.a=o.a; it.b=o.b; it.x=o.x;
  }
  it.w=clamp(fin(o.w)?o.w:600, 100, 6000);
  if(fin(o.d)) it.d=clamp(o.d, 100, 3000);
  if(fin(o.h)) it.h=clamp(o.h, 100, 3000);
  if(fin(o.z)) it.z=clamp(o.z, 0, 3000);
  if(ownKey(DEV,o.dev) && DEV[o.dev].kinds.includes(o.kind)) it.dev=o.dev;
  if(ownKey(FRONTS,o.front)) it.front=o.front;
  if(o.hinge==='left'||o.hinge==='right') it.hinge=o.hinge;
  if(fin(o.faucetH)) it.faucetH=clamp(o.faucetH, 0, 600);
  if(o.noOven===true && it.dev==='hob' && it.kind==='base') it.noOven=true;
  if(o.water===true && it.dev==='fridge' && it.kind==='tall') it.water=true;
  if(o.corner===true && ownKey(CORNER,o.kind)){
    it.corner=true;
    if(fin(o.door)) it.door=clamp(o.door, 100, Math.max(100, it.w-50));
    if(o.cEnd===0 || o.cEnd===1) it.cEnd=o.cEnd;
    if(o.ctype==='L' || o.ctype==='diag'){ it.ctype=o.ctype; delete it.door; }
    const inn = it.ctype ? CSHAPE[o.kind][it.ctype].inner : CORNER[o.kind].inner;
    if(ownKey(inn,o.inner) && o.inner!=='boden') it.inner=o.inner;
  }
  if(COLD.has(it.dev) && it.kind==='tall' && ownKey(FRIDGE,o.fz) && FRIDGE[o.fz].devs.includes(it.dev)){
    it.fz=o.fz;
    if(fin(o.doorT)) it.doorT=clamp(o.doorT, DOORT_LIM[0], DOORT_LIM[1]);
    if(o.gf===true && it.fz==='free' && it.dev==='fridge') it.gf=true;
  } else if(COLD.has(it.dev) && it.kind==='tall' && SWINGS.includes(o.swing)) it.swing=o.swing;
  if(o.kind==='island' && fin(o.bar) && o.bar>=1) it.bar=clamp(Math.round(o.bar), 50, 800);
  if(Array.isArray(o.store)){ const st=[...new Set(o.store.filter(k=>CKEY.has(k)))]; if(st.length) it.store=st; }
  return it;
}
function normKitchen(o){
  const K={spec:normSpec(o&&o.spec), items:[], seq:1};
  const src=(o && Array.isArray(o.items)) ? o.items : [];
  const used=new Set();
  src.forEach(x=>{ const it=normItem(x); if(it) K.items.push(it); });
  K.items.forEach(it=>{ if(!(Number.isInteger(it.id) && it.id>0) || used.has(it.id)) it.id=null; else used.add(it.id); });
  let seq=1; used.forEach(v=>{ if(v>=seq) seq=v+1; });   // kein Math.max(...): zu viele Teile sprengten den Stapel
  K.items.forEach(it=>{ if(it.id==null){ it.id=seq++; } });
  K.seq=Math.max(seq, (o && Number.isInteger(o.seq)) ? o.seq : 0, 1);
  const fr=o && o.frame;
  if(fr && typeof fr.a==='string' && typeof fr.b==='string' && fr.a!==fr.b) K.frame={a:fr.a, b:fr.b};
  fitStores(K);
  return K;
}
// Bezugsecken der freien Teile (Insel, Tisch). Ihr Rahmen hing früher an
// walls[0]: Wand weg und neu gezogen oder „Ring“ - schon drehten und sprangen
// alle freien Teile. Jetzt zwei Ecken-IDs in K.frame.
// - gültig (beide Ecken in pts): bleibt.
// - fehlt: erste Wand, deren Ecken es gibt (alte Stände ohne Anker liegen so
//   unverändert im bisherigen Rahmen).
// - Ecke gelöscht und oldPts (Stand vor der Änderung, alter Fit) kennt noch
//   beide Rahmen: freie Teile in den neuen Rahmen umrechnen, ihre Lage im
//   Raum bleibt. Nur im alten Fit rechnen - der Solver darf den Grundriss
//   danach frei verschieben und drehen.
function anchorFrame(K, pts, walls, oldPts){
  if(!K) return null;
  const ok=(P,f)=>!!f && P.some(p=>p.id===f.a) && P.some(p=>p.id===f.b);
  if(ok(pts, K.frame)) return K.frame;
  const w=(walls||[]).find(([a,b])=>a!==b && ok(pts,{a,b}) && (!oldPts || ok(oldPts,{a,b})));
  if(!w) return K.frame||null;
  const nf={a:w[0], b:w[1]};
  if(oldPts && ok(oldPts, K.frame)){
    const F0=TL.frameOf(oldPts, null, K.frame), F1=TL.frameOf(oldPts, null, nf);
    const dr=Math.atan2(dot(F0.u,F1.v), dot(F0.u,F1.u))*180/Math.PI;
    K.items.forEach(it=>{ if(!KIND[it.kind].free) return;
      const l=TL.toLocal(F1, TL.toWorldF(F0, {x:it.x, y:it.y}));
      it.x=Math.round(l.x*10)/10; it.y=Math.round(l.y*10)/10;
      it.rot=Math.round((((it.rot||0)+dr)%360+360)%360*100)/100%360; });
  }
  K.frame=nf;
  return nf;
}
// Ecke id wird gleich gelöscht (deletePoint, VOR dem Filtern): ist sie eine
// Bezugsecke, freie Teile JETZT umhängen. Danach kennt keine Geometrie die
// Ecke mehr – ein späterer Fit auch nicht –, „Rahmen behalten bis zur
// Umrechnung“ hieße also: nie umrechnen, und bei der nächsten Umordnung
// springen. Gerechnet wird im Fit; ohne Fit (alle Messungen aus) in der
// Skizze: mit „Ausrichten“ ist sie der Fit, sonst die maßstäbliche Skizze
// (scaleSketch) – genau bis auf deren Verzug, statt meterweit zu springen.
function cornerDeleted(K, id, fitPts, sketchPts, walls){
  if(!K || !K.frame || (K.frame.a!==id && K.frame.b!==id)) return K ? K.frame||null : null;
  const old=fitPts||sketchPts;
  return anchorFrame(K, sketchPts.filter(p=>p.id!==id), (walls||[]).filter(([a,b])=>a!==id && b!==id), old);
}
// Inhalte, die in einem Hochschrank mit Gerät nach den jetzigen Küchenmaßen
// keinen Platz mehr haben (Schrank niedriger, oberes Fach weg), entfernen –
// sonst zählten sie unsichtbar in den Wegen weiter. Je Fach einer; was
// zuerst eingetragen ist, bleibt. Gibt die Zahl zurück.
function fitStores(K, only){
  let n=0;
  K.items.forEach(it=>{ if(!tallDev(it) || !it.store || (only && it!==only)) return;
    const ok=storable(it,K.spec), keep=[];
    it.store.forEach(x=>{ if(ok.includes(x) && storeFits(it,K.spec,[...keep,x])) keep.push(x); });
    n+=it.store.length-keep.length;
    if(keep.length) it.store=keep; else delete it.store; });
  return n;
}
const isEmpty=K=>!K || (!K.items.length && Object.keys(K_DEF).every(k=>K.spec[k]===K_DEF[k]) && !K.spec.entry);
// ---------- Raum ----------
// Umgebung aus dem Aufmaß: Ring, Wände mit Innennormale, Höhen, Öffnungen.
// pts sind die ausgeglichenen Punkte (M.fit.pts), sonst stimmt nichts.
// frame: Bezugsecken der freien Teile (K.frame), fehlt er, gilt walls[0].
function makeEnv(pts, walls, openings, hmeas, water, frame){
  const ring=C.wallPolygon(pts, walls);
  if(!ring) return null;
  const I=C.idx(pts), wallsByKey=new Map();
  TL.ringsOf(ring).forEach((R,ri)=>{
    TL.edgesOf(R).forEach((e,i)=>{
      const a=R[i], b=R[(i+1)%R.length];
      // edgesOf: n zeigt beim Außenring nach außen, bei Inseln aus der Insel
      // heraus - also in den Raum (vgl. insetRoom).
      const nIn = ri===0 ? {x:-e.n.x, y:-e.n.y} : {x:e.n.x, y:e.n.y};
      // Kanonisch: a = kleinere Ecken-ID. Alle Teile einer Wand rechnen so im
      // selben Rahmen (s ab a), egal in welcher Richtung gezeichnet wurde.
      const [ka,kb]=[a.id,b.id].sort();
      wallsByKey.set(ka+'|'+kb, {a:ka, b:kb, nIn, hole:ri>0, L:len(sub(b,a))});
    });
  });
  const F=TL.frameOf(pts, walls, frame);
  // hmeas samt Knickpunkten ({kind:'k'}) bleibt in E: die Decke je Wand
  // (ceilShape) entsteht daraus.
  return {pts, walls, ring, I, wallsByKey, hmeas:hmeas||[], shapes:new Map(), F, openings:(openings||[]).filter(o=>o && o.a && o.b && Number.isFinite(o.x) && Number.isFinite(o.w)),
          water:(water||[]).filter(w=>w && wallsByKey.has(wallKeyOf(w.a,w.b)))};
}
const P=(E,id)=>{ const i=E.I[id]; return i==null?null:E.pts[i]; };
const wallKeyOf=(a,b)=>[a,b].sort().join('|');
// Wandrahmen für a->b: Ursprung a, u entlang, n in den Raum.
function wallFrame(E, a, b){
  const W=E.wallsByKey.get(wallKeyOf(a,b)), A=P(E,a), B=P(E,b);
  if(!W || !A || !B) return null;
  const L=len(sub(B,A)); if(!(L>1)) return null;
  return {a, b, A, B, u:unit(sub(B,A)), n:W.nIn, L, key:wallKeyOf(a,b), hole:W.hole};
}
const wpt=(Wf,s,q)=>({x:Wf.A.x+Wf.u.x*s+Wf.n.x*q, y:Wf.A.y+Wf.u.y*s+Wf.n.y*q});
// Decke einer Wand: Oberkante als Polylinie aus Eckhöhen UND Knickpunkten
// (Giebel, Kniestock) - wallShape, ceilingAt und ceilingMin aus raum-geometrie.js,
// dieselbe Quelle wie Öffnungsprüfung und Wandansicht, hier keine zweite
// Deckenlogik. raum-geometrie.js lädt NACH diesem Block: erst beim Aufruf über
// globalThis. Je Richtung a->b einmal gerechnet
// und in E gemerkt: s zählt ab a, und Teile stehen in beiden Richtungen.
function ceilShape(E, a, b){
  const k=a+'|'+b;
  if(!E.shapes.has(k)) E.shapes.set(k, globalThis.wallShape(E.pts, E.hmeas, a, b));
  return E.shapes.get(k);
}
const ceilAt=(E,Wf,s)=>globalThis.ceilingAt(ceilShape(E,Wf.a,Wf.b), s);
// Niedrigste Decke über [s0,s1]: an den Enden ODER an einem Knick dazwischen
// (eine Kehle läge sonst unbemerkt über dem Teil).
const ceilMin=(E,Wf,s0,s1)=>globalThis.ceilingMin(ceilShape(E,Wf.a,Wf.b), s0, s1);
// Rechts aus Sicht dessen, der vor der Front steht und auf sie schaut
// (Bildschirmsinn, y nach unten): Blick f=-n, rechts=(-f.y, f.x).
const rightOf=n=>({x:n.y, y:-n.x});

// ---------- Geometrie eines Teils ----------
function dims(K, it){
  const S=K.spec, D=derived(S), fz=fzOf(it);
  const d = it.d!=null ? it.d : fz ? fz.d : it.kind==='wall' ? S.wallD : it.kind==='tall' ? S.tallD
          : it.kind==='island' ? 900 : it.kind==='table' ? 800 : S.baseD;
  let z0, z1;
  if(fz){ z0=0; z1 = it.h!=null ? it.h : fz.h; }      // frei stehend: Gerätehöhe, kein Sockel
  else if(it.kind==='wall'){ z0 = it.z!=null ? it.z : D.wallZ; z1 = z0 + (it.h!=null?it.h:S.wallH); }
  else if(it.kind==='tall'){ z0=0; z1 = it.h!=null ? it.h : D.tallTop; }
  else if(it.kind==='table'){ z0=0; z1 = it.h!=null ? it.h : 750; }
  else if(it.kind==='island'){ z0=0; z1 = it.h!=null ? it.h : D.workH; }
  else { z0=0; z1=D.workH; }   // Unterschrank hängt an der gemeinsamen Platte: Höhe nur über die Küchenmaße
  return {d, z0, z1};
}
// Grundriss-Viereck (Welt, mm), Frontlinie, Frontnormale. null = verwaist.
function geom(E, K, it){
  const {d,z0,z1}=dims(K,it);
  if(KIND[it.kind].free){
    if(!E.F) return null;
    const c=TL.toWorldF(E.F, {x:it.x, y:it.y});
    const fu=E.F.u, fv=E.F.v, cr=Math.cos(it.rot*Math.PI/180), sr=Math.sin(it.rot*Math.PI/180);
    const u={x:fu.x*cr+fv.x*sr, y:fu.y*cr+fv.y*sr}, n={x:-fu.x*sr+fv.x*cr, y:-fu.y*sr+fv.y*cr};
    const hw=it.w/2, hd=d/2;
    const poly=[add(add(c,mul(u,-hw)),mul(n,-hd)), add(add(c,mul(u,hw)),mul(n,-hd)),
                add(add(c,mul(u,hw)),mul(n,hd)),  add(add(c,mul(u,-hw)),mul(n,hd))];
    const g={it, poly, z0, z1, d, u, n, c, free:true,
            front:[poly[3], poly[2]], frontMid:add(c,mul(n,hd))};
    // Tresen (Meldung M-20261109-135019-2dbf5c): die Platte steht hinten
    // (gegenüber den Fronten) um it.bar über. foot = was am Boden Platz
    // braucht (Platte samt Hockern darunter), poly bleibt der Korpus.
    if(it.kind==='island' && it.bar>0){ g.bar=it.bar; g.foot=[add(poly[0],mul(n,-it.bar)), add(poly[1],mul(n,-it.bar)), poly[2], poly[3]]; }
    return g;
  }
  const Wf=wallFrame(E, it.a, it.b);
  if(!Wf) return null;
  const s0=it.x, s1=it.x+it.w;
  const poly=[wpt(Wf,s0,0), wpt(Wf,s1,0), wpt(Wf,s1,d), wpt(Wf,s0,d)];
  return {it, poly, z0, z1, d, u:Wf.u, n:Wf.n, Wf, s0, s1, free:false,
          c:wpt(Wf,(s0+s1)/2,d/2), front:[poly[3],poly[2]], frontMid:wpt(Wf,(s0+s1)/2,d)};
}
// Linke und rechte Frontkante aus Sicht davor.
function frontLR(g){
  const r=rightOf(g.n), [p,q]=g.front;
  return dot(sub(q,p), r)>=0 ? {L:p, R:q} : {L:q, R:p};
}
const bandsMeet=(a,b)=>a.z0 < b.z1-1 && b.z0 < a.z1-1;

// Kreissektor als konvexes Polygon (Schwenkbereich einer Tür).
function sector(c, r, a0, a1, steps=8){
  const out=[c];
  for(let i=0;i<=steps;i++){ const a=a0+(a1-a0)*i/steps; out.push({x:c.x+Math.cos(a)*r, y:c.y+Math.sin(a)*r}); }
  return out;
}
const ang=v=>Math.atan2(v.y,v.x);
// Schwenkbereich eines Drehflügels: Angel h, Blatt liegt geschlossen in
// Richtung along, öffnet zur Seite out (beides Einheitsvektoren), 90°.
// Flügel frei stehender Kühlschränke (French Door, Side by Side): Blatt
// W × t (Türdicke), Drehachse an der Gerätekante in der Mitte der Tür-
// dicke (Korpusfront + t/2). Offen um θ ragt das Blatt seitlich
// max(0, −W·cos θ) + t/2·sin θ über die Gerätekante, bei 90° also t/2.
// Gegen die Bosch-Maßblätter: KFF96PIEP (W 452, t 96) bei 90° 48 (Blatt
// 45), bei 118° 254 (268) und 1105 tief ab Wand (1102); KAN93VIFP
// Gefrierteil (W 387, t 79) bei 130° 279 (277), Kühlteil (W 515) bei 135°
// 392 (418). Die Griffe fehlen im Modell, ganz offen liegt es darum bis
// 26 mm unter dem Blatt. Nachbartabellen: French Door trifft es (≤ 600 → 3 mm,
// > 700 → wie Wand); beim Side by Side verlangt Bosch auch neben ≤ 600 tiefen
// Möbeln 50 mm, das Modell braucht dort keine Luft (Griffe, Scharnier).
function leaves(g){
  const fz=fzOf(g.it); if(!fz) return [];
  const {L:pl, R:pr}=frontLR(g), n=g.n, t=doorTOf(g.it), w=len(sub(pr,pl)), dir=unit(sub(pr,pl));
  const cL=add(pl, mul(n,-t/2)), cR=add(pr, mul(n,-t/2));
  if(fz.single){
    // Eine Tür über die ganze Breite; mit Gefrierteil zwei übereinander.
    const right=g.it.hinge==='right', P=right?cR:cL, along=right?mul(dir,-1):dir, side=right?'right':'left';
    const zg=Math.min(fz.gfZ, g.z1-400);
    return g.it.gf ? [{name:'Kühlteil (oben)', P, along, n, W:w, t, full:fz.full, side, z0:zg+10, z1:g.z1-10},
                      {name:'Gefrierteil (unten)', P, along, n, W:w, t, full:fz.full, side, z0:20, z1:zg-10}]
                   : [{name:'Tür', P, along, n, W:w, t, full:fz.full, side, z0:20, z1:g.z1-10}];
  }
  const wl=w*fz.split;
  return [
    {name:fz.leaves[0], P:cL, along:dir,         n, W:wl,   t, full:fz.full, side:'left'},
    {name:fz.leaves[1], P:cR, along:mul(dir,-1), n, W:w-wl, t, full:fz.full, side:'right'},
  ];
}
function leafRect(lf, th){
  const c=Math.cos(th), s=Math.sin(th);
  const a={x:lf.along.x*c+lf.n.x*s, y:lf.along.y*c+lf.n.y*s}, m={x:lf.n.x*c-lf.along.x*s, y:lf.n.y*c-lf.along.y*s};
  const h=lf.t/2, P0=add(lf.P,mul(m,-h)), P1=add(lf.P,mul(m,h));
  return [P0, add(P0,mul(a,lf.W)), add(P1,mul(a,lf.W)), P1];
}
// Seitlicher Platzbedarf eines Flügels bei θ (über die Gerätekante hinaus).
const leafReachSide=(lf,th)=>Math.max(0, -lf.W*Math.cos(th)) + lf.t/2*Math.sin(th);
// Wie weit geht ein Flügel auf? 2°-Schritte bis zum vollen Winkel; das
// erste Hindernis beendet. {angle (Grad, frei erreicht), hit (Text)}.
function leafReach(E, L, g, e, roomDoors, winSashes){
  const lf=e.leaf, band={z0:e.z0, z1:e.z1};
  const tops=L.tops.filter(t=>!t.island);
  const blockedAt=th=>{
    const R=leafRect(lf, th);
    if(!polyInRoom(E, R)) return 'die Wand';
    for(const h of L.G){ if(h===g || !bandsMeet(band,h)) continue;
      // Insel/Tresen: auf Plattenhöhe zählt die ganze Platte mit Überstand.
      const hp = h.foot && band.z1 > h.z1-60 ? h.foot : h.poly;
      if(TL.convexOverlap(R, hp, 2)) return labelOf(h.it); }
    for(const t of tops){ if(bandsMeet(band,t) && TL.convexOverlap(R, t.poly, 2)) return 'die Arbeitsplatte'; }
    for(const s of (roomDoors||[])){ if(bandsMeet(band,s) && TL.convexOverlap(R, s.poly, 2)) return s.txt; }
    for(const s of (winSashes||[])){ if(bandsMeet(band,s) && TL.convexOverlap(R, s.poly, 2)) return s.txt; }
    return null;
  };
  let angle=0, hit=null;
  for(let a=2; a<=lf.full; a+=2){ hit=blockedAt(a*Math.PI/180); if(hit) break; angle=a; }
  // Ungerader Vollwinkel (115°): den letzten Schritt genau auf ihn setzen,
  // sonst endet die Suche bei 114° ohne Hindernis („null ist im Weg“).
  if(!hit && angle<lf.full){ hit=blockedAt(lf.full*Math.PI/180); if(!hit) angle=lf.full; }
  return {angle, hit};
}
// Zimmertüren: wie weit geht das Blatt auf, bis es an ein Küchenteil stößt?
// (Meldung M-20261109-145411-a0f040: der Bogen lief durch die Insel.) Blatt
// 40 mm dick auf der Schwenkseite, 2°-Schritte bis zum Anschlag, den
// doorSwing an den Wänden findet. Je Tür {id, deg, maxDeg, hit, hitId}.
const ROOM_LEAF_T=40;
function doorReach(E, L){
  const out=new Map();
  if(!globalThis.doorSwing) return out;
  E.openings.filter(o=>o.kind==='door').forEach(o=>{
    const s=globalThis.doorSwing(E.pts, E.walls, o); if(!s) return;
    const band={z0:o.y||0, z1:(o.y||0)+o.h}, maxDeg=Math.floor(s.max*180/Math.PI+1e-6);
    const blockedAt=a=>{
      const th=s.dir0+s.sense*a*Math.PI/180, u={x:Math.cos(th), y:Math.sin(th)};
      const v={x:-s.sense*u.y, y:s.sense*u.x};        // zur Seite, in die das Blatt schwenkt
      const P0=s.angel, R=[P0, add(P0,mul(u,o.w)), add(add(P0,mul(u,o.w)),mul(v,ROOM_LEAF_T)), add(P0,mul(v,ROOM_LEAF_T))];
      // Auch der zweite Schenkel eines Eckschranks über Eck (wing): das Hauptteil
      // deckt dort nur seine eigene Wand, der Schenkel an der Nachbarwand ist ein
      // eigener Eintrag (gleiches it, also gleicher Name und gleiche id).
      return L.G.find(g=>bandsMeet(band,g) && TL.convexOverlap(R, g.foot||g.poly, 1)) || null;
    };
    let deg=0, hit=null;
    for(let a=2; a<=maxDeg; a+=2){ hit=blockedAt(a); if(hit) break; deg=a; }
    if(!hit && deg<maxDeg){ hit=blockedAt(maxDeg); if(!hit) deg=maxDeg; }
    out.set(o.id, {id:o.id, deg, maxDeg, hit:hit?nameOf(hit.it):null, hitId:hit?hit.it.id:null, s});
  });
  return out;
}
function swing90(h, along, out, r, deg=90){
  const a0=ang(along), a1=ang(out);
  let d=a1-a0; while(d>Math.PI) d-=2*Math.PI; while(d<-Math.PI) d+=2*Math.PI;
  return sector(h, r, a0, a0+d*deg/90, Math.round(8*deg/90));
}

// Welche Front hat ein Teil, und was braucht sie offen? (Grundriss + Höhe)
function frontKind(it){
  if(it.dev==='dw') return 'flapdown';
  if(it.dev==='oven') return 'flapdown';
  if(ovenBelow(it)) return 'flapdown';                        // Backofen unter dem Kochfeld
  if(it.kind==='table' || it.dev==='hood') return null;
  return it.front || (it.kind==='base'||it.kind==='island' ? 'drawer' : 'door');
}
// Hat das Teil einen wählbaren Türanschlag (Panel „Anschlag“, Taste F,
// Stückliste)? Hochschrank mit Gerät; Drehtür bis 60 cm (nicht L-Eck),
// Kühlgerät oder Diagonal-Eck; Kühlgerät mit Gefrierteil nur einflüglig.
const hasHinge=it=>tallDev(it) || frontKind(it)==='door' && (it.w<=600 && !(it.corner && it.ctype==='L') || isCold(it) || it.ctype==='diag') && (!fzOf(it) || fzOf(it).single);
// Eckschrank: welche Seite ist blind (zur nächsten Ecke), wie breit?
// Unten wie oben (Hänge-Eckschrank). Mit Türbreite door ist die Blende der
// Rest; sonst so breit wie die tatsächliche Querzeile (g.cross aus layout)
// plus Passblende. cEnd legt die Ecke fest, sonst die nähere.
function cornerBlind(g, S){
  const it=g.it, C=CORNER[it.kind];
  if(!it.corner || it.ctype || !C || frontKind(it)!=='door' || it.w<2*C.minDoor) return null;
  const depth = g.cross ? g.cross.d : it.kind==='wall' ? S.wallD : S.baseD;
  const b = it.door!=null ? it.w-it.door : Math.min(it.w-C.minDoor, depth+PASS);
  if(!(b>0 && b<it.w)) return null;
  return {b, atS0:cornerAtS0(g)};
}
// Liegt die Ecke des Eckschranks bei s0 (Ecke a) oder bei s1 (Ecke b)?
const cornerAtS0=g=>g.free ? true : g.it.cEnd!=null ? g.it.cEnd===0 : g.s0 <= g.Wf.L-g.s1;
// Querzeile an der Ecke: Teile im selben Höhenband an der Nachbarwand, die
// direkt vor dem Eckschrank beginnen (Abstand zur Ecke bis Tiefe des
// Eckschranks + Passblende) – sie stehen vor seiner Blende. Ihre Tiefe.
function crossAt(E, K, G, g, atS0){
  if(g.free) return null;
  const id = atS0 ? g.Wf.a : g.Wf.b;
  let best=null;
  G.forEach(h=>{
    if(h===g || h.free || h.Wf.key===g.Wf.key || !bandsMeet(g,h)) return;
    if(h.Wf.a!==id && h.Wf.b!==id) return;
    const atA = h.Wf.a===id, dist = atA ? h.s0 : h.Wf.L-h.s1;
    if(dist > cornerStop(E,h.Wf,h.d,atA?0:1)+g.d+PASS+20) return;   // beginnt nicht vor dem Eckschrank
    if(Math.abs(dot(h.n,g.n))>0.7) return;                       // keine Querwand
    if(!best || h.d>best.d) best={d:h.d, id:h.it.id};
  });
  return best;
}
// Lage eines Eckschranks: Blende hinter der Querzeile, Tür frei davor
// (Querzeile + Passblende). Ohne Querzeile bündig in die Ecke. null, wenn
// es dort nicht passt.
function cornerPlace(E, K, L, it, Wf){
  if(!it.corner) return null;
  const t={...it, a:Wf.a, b:Wf.b, x:it.x!=null?it.x:0}, g=geom(E,K,t); if(!g) return null;
  const atS0=cornerAtS0(g), d=g.d, cr=crossAt(E,K,L.G.filter(h=>h.it.id!==it.id),g,atS0);
  const g2={...g, cross:cr}, cb=cornerBlind(g2, K.spec);
  const lo=cornerStop(E,Wf,d,atS0?0:1);
  const dist = cr && cb && !it.ctype ? Math.max(lo, cr.d+PASS-cb.b) : lo;
  const x = atS0 ? dist : Wf.L-dist-it.w;
  return fitsAt(E,K,L,it,Wf,x) ? Math.round(x*10)/10 : null;
}
// Stelle (und Breite) für ein neues Wandteil an der Wand Wf, ab near: die erste
// freie Stelle, bei einem Eckschrank dort in der Eckenlage (cornerPlace). shrink:
// passt die Breite nicht, die größte Rasterbreite, die passt – auch für sie wird
// die Lage neu bestimmt (die Eckenlage hängt an der Breite: Blende + Querzeile).
// {x, w} oder null; das Teil selbst bleibt unverändert.
function placeOnWall(E, K, L, it, Wf, near, shrink){
  const slot=t=>{ let x=freeSlot(E,K,L,t,Wf,near);
    if(t.corner){ const xc=cornerPlace(E,K,L,{...t, x:x!=null?x:(near!=null?near:0)},Wf); if(xc!=null) x=xc; }
    return x; };
  let x=slot(it), w=it.w;
  if(x==null && shrink){
    const widths=(it.dev?DEV[it.dev].widths:it.corner?CORNER[it.kind].bodies:WIDTHS).filter(v=>v<it.w).sort((p,q)=>q-p);
    for(const v of widths){ const xx=slot({...it, w:v}); if(xx!=null){ x=xx; w=v; break; } }
  }
  return x==null ? null : {x, w};
}
// Kopiervorlage (⌘C): das Teil ohne Lage (id, Wand, x, y) und ohne gesetzte Ecke.
// cEnd gilt nur im Rahmen der Wand, an der es stand; an einer anderen Wand wäre
// es die falsche Ecke und überstimmte den Zeiger (cornerAtS0).
function clipItem(it){
  const t=JSON.parse(JSON.stringify(it));
  ['id','a','b','x','y','cEnd'].forEach(k=>{ delete t[k]; });
  return t;
}
// Eckschrank nach dem Ablegen (kitchenUp). Mit snap (ohne ⌥) rastet ein Schrank über Eck /
// diagonal bündig in die nähere Ecke der Wand ein. Sonst bleibt die Lage; eine gesetzte
// Ecke (cEnd, relativ zur Wand, an der er stand) folgt ihm in die andere Ecke o:
// 1. Er steht im Bereich von o: nicht weiter von der Ecke weg als die Eckenlage (cornerPlace,
//    Blende hinter der Querzeile; bündig am Wandende, der übliche Endpunkt des Ziehens,
//    gehört dazu) – näher ist die Blende zu kurz, mit snap rückt er in die Eckenlage. Liegt er
//    im Bereich nur einer Ecke, entscheidet das; in beiden (kurze Wand) die Rastkante, auf der
//    er genau steht.
// 2. In keinem Bereich: die Ecke, an der allein eine Querzeile vor seiner Front steht (Abstand
//    zur Ecke < ihre Tiefe + Passblende) – die Blende gehört auf diese Seite; die Lage bleibt
//    (jeder größere Abstand als die Eckenlage ist gültig).
// Über Eck / diagonal ist die Eckenlage bündig, dort zählt nur 1. Die Nähe taugt nicht: an
// kurzen Wänden steht der Halbeckschrank abgerückt (UE100-50 an 1200er Wand bei x=130: näher
// an B, steht aber in A). {cEnd, x} oder null.
function cornerDrop(E, K, L, it, Wf, snap){
  if(!it.corner) return null;
  if(it.ctype && snap){
    const near=it.x <= Wf.L-it.x-it.w ? 0 : 1, x=cornerPlace(E,K,L,{...it, cEnd:near},Wf);
    return x!=null ? {cEnd:near, x} : null;
  }
  if(it.cEnd==null) return null;
  const g=geom(E,K,{...it, a:Wf.a, b:Wf.b}); if(!g) return null;
  const others=L.G.filter(h=>h.it.id!==it.id), gap=(e,x)=>e===0 ? x : Wf.L-x-it.w;        // Abstand zur Ecke e
  const lay=e=>cornerPlace(E,K,L,{...it, cEnd:e},Wf);
  const zone=(e,xc)=>gap(e,it.x) <= (xc!=null ? gap(e,xc) : cornerStop(E,Wf,g.d,e))+0.5;
  // Querzeile vor der Front an Ecke e (wie im Eck-Kasten: Abstand zur Ecke < Tiefe + Passblende)
  const hid=e=>{ const cr=it.ctype ? null : crossAt(E,K,others,g,e===0); return !!cr && gap(e,it.x) < cr.d+PASS-0.5; };
  const on=xc=>xc!=null && Math.abs(xc-it.x)<0.5;                                          // genau auf der Eckenlage
  const o=1-it.cEnd, xo=lay(o), xc=lay(it.cEnd), zo=zone(o,xo), zc=zone(it.cEnd,xc);
  const flip = zo!==zc ? zo : zo ? on(xo) && !on(xc) : hid(o) && !hid(it.cEnd);
  return flip ? {cEnd:o, x:snap && zo && xo!=null ? xo : it.x} : null;
}
// Eckschrank wieder zum normalen Schrank: alles weg, was nur ein Eckschrank hat
// (Knopf „Normaler Schrank“, Front ≠ Drehtür, Bauart ohne Eckschrank). Sonst
// bliebe in der Sitzung stehen, was nach dem Laden (normItem) fehlt.
function clearCorner(t){
  delete t.corner; delete t.door; delete t.cEnd; delete t.inner; delete t.ctype;
  if(t.w>(t.kind==='wall'?900:1200)) t.w=600;
}
// Front wechseln: der Eckschrank hat nur die Drehtür, jede andere macht ihn zum
// normalen Schrank.
function frontSet(t, v){ t.front=v; if(v!=='door' && t.corner) clearCorner(t); }
// Über Eck / Diagonal: der Korpus steht bündig in einer rechtwinkligen
// Innenecke. Das Teil selbst ist das Rechteck an seiner Wand (Schenkel A,
// mit dem Eckquadrat); der zweite Schenkel an der Nachbarwand wird ein
// eigener Eintrag in L.G (wing:true, gleiches it), damit Platte, Kollision,
// Maßkette und Rastkanten dort ohne Sonderfälle stimmen. Am Hauptteil:
// outline (L bzw. Fünfeck), frontLines, bei Diagonal foot = Fünfeck.
// null, wenn das Teil nicht bündig in so einer Ecke steht.
function cornerWing(E, K, g){
  const it=g.it; if(g.free || g.wing || !shapeOf(it)) return null;
  const atS0=cornerAtS0(g), cid=atS0 ? g.Wf.a : g.Wf.b, other=atS0 ? g.Wf.b : g.Wf.a;
  const dist=atS0 ? g.s0 : g.Wf.L-g.s1;
  if(dist>cornerStop(E,g.Wf,g.d,atS0?0:1)+1) return null;
  const R=TL.ringsOf(E.ring).find(R=>R.some(p=>p.id===g.Wf.a)&&R.some(p=>p.id===g.Wf.b)); if(!R) return null;
  const i=R.findIndex(p=>p.id===cid);
  const nb=[R[(i+R.length-1)%R.length], R[(i+1)%R.length]].find(p=>p.id!==other); if(!nb) return null;
  const Wn=wallFrame(E, ...[cid,nb.id].sort()); if(!Wn || Math.abs(dot(Wn.u,g.Wf.u))>0.05) return null;   // ~90°
  const atA=Wn.a===cid, ua=atS0 ? g.Wf.u : mul(g.Wf.u,-1), ub=atA ? Wn.u : mul(Wn.u,-1);
  if(dot(ub,g.n)<0.99 || dot(ua,Wn.n)<0.99) return null;                                    // Innenecke
  const w=it.w, d=g.d;
  if(w>Wn.L+1 || w<=d+50) return null;
  // s0..s1 reicht bis in die Ecke (Maßkette und Zeile an der Nachbarwand
  // sehen den ganzen Schenkel); vs0..vs1 ist der Teil außerhalb des
  // Eckquadrats, den das Hauptteil nicht schon deckt (Zeichnung, 3D, Tür).
  const s0=atA ? 0 : Wn.L-w, s1=atA ? w : Wn.L, vs0=atA ? d : Wn.L-w, vs1=atA ? w : Wn.L-d;
  const poly=[wpt(Wn,s0,0), wpt(Wn,s1,0), wpt(Wn,s1,d), wpt(Wn,s0,d)];
  const C=P(E,cid), at=(a,b)=>add(add(C,mul(ua,a)),mul(ub,b));
  return {it, wing:true, main:g, poly, z0:g.z0, z1:g.z1, d, u:Wn.u, n:Wn.n, Wf:Wn, s0, s1, vs0, vs1, free:false,
          c:wpt(Wn,(vs0+vs1)/2,d/2), front:[wpt(Wn,vs0,d),wpt(Wn,vs1,d)], frontMid:wpt(Wn,(vs0+vs1)/2,d), env:[], C, ua, ub, at};
}
// Hauptteil um Umriss, Fronten und Standpunkt ergänzen (nach cornerWing).
function cornerShape(g, wg){
  const w=g.it.w, d=g.d, at=wg.at, diag=g.it.ctype==='diag';
  g.wingG=wg;
  g.outline = diag ? [at(0,0), at(w,0), at(w,d), at(d,w), at(0,w)]
                   : [at(0,0), at(w,0), at(w,d), at(d,d), at(d,w), at(0,w)];
  if(diag){ g.foot=g.outline; g.frontLines=[[at(w,d), at(d,w)]]; }
  else g.frontLines=[[at(w,d), at(d,d)], [at(d,d), at(d,w)]];
  const out=unit(add(wg.ua,wg.ub));
  g.cornerFront = diag ? mul(add(at(w,d),at(d,w)),0.5) : at((w+d)/2,(w+d)/2);
  g.cornerOut = out;
}
// Typbezeichnung nach nobilia (UE100-50), wo Korpus und Tür einem Typ entsprechen.
function cornerType(it){
  const C=CORNER[it.kind]; if(!it.corner || !C) return null;
  const sh=shapeOf(it); if(sh) return sh.type[it.inner||'boden']+Math.round(it.w/10);
  const doors=C.doors[Math.round(it.w)]||[];
  if(it.door==null || !doors.includes(Math.round(it.door))) return null;
  const nom=(C.nominal||{})[Math.round(it.w)] || Math.round(it.w/10);
  return `${C.type[it.inner||'boden']}${nom}-${Math.round(it.door/10)}`;
}
function envelopes(K, g){
  const it=g.it, S=K.spec, D=derived(S), fk=frontKind(it), out=[];
  if(!fk || fk==='slide' || fk==='open') return out;
  const {L:pl, R:pr}=frontLR(g), n=g.n, w=it.w;
  // Über Eck: zwei Türen in der Innenecke, Angel je am äußeren Ende
  // (nobilia 165°-Scharniere; der Schwenkbereich liegt im Eckfeld davor).
  // Diagonal: eine Tür auf der Schräge, Anschlag wählbar.
  if(shapeOf(it) && !g.free){
    const wg=g.wingG; if(!wg || fk!=='door') return out;
    const z0 = it.kind==='wall' ? g.z0 : g.z0+S.plinth, z1 = it.kind==='wall' ? g.z1 : D.workH-S.topT;
    const d=g.d, at=wg.at;
    const door=(h,o,dir)=>{ const r=len(sub(o,h)), al=unit(sub(o,h)); out.push({what:'Tür', poly:swing90(h, al, dir, r), z0, z1, hinge:h, side:'corner', r, along:al, n:dir}); };
    if(it.ctype==='diag'){
      const P1=at(w,d), P2=at(d,w), nd=g.cornerOut;
      const right = dot(sub(P2,P1), rightOf(nd))>=0 ? P2 : P1, left = right===P2 ? P1 : P2;
      const h = it.hinge==='right' ? right : left;
      door(h, h===P1 ? P2 : P1, nd);
    } else { door(at(w,d), at(d,d), wg.ub); door(at(d,w), at(d,d), wg.ua); }
    return out;
  }
  const cb=cornerBlind(g,S);
  if(cb && fk==='door' && !g.free){
    // Eine Tür auf dem freien Teil, Angel außen (weg von der Ecke). Unten
    // mit Schubkasten (nobilia UE): Auszug oben, Tür darunter.
    let z0 = it.kind==='wall' ? g.z0 : g.z0+S.plinth, z1 = it.kind==='wall' ? g.z1 : D.workH-S.topT;
    const sEdge = cb.atS0 ? g.s0+cb.b : g.s1-cb.b, sOut = cb.atS0 ? g.s1 : g.s0;
    const h=wpt(g.Wf,sOut,g.d), o=wpt(g.Wf,sEdge,g.d), r=Math.abs(sOut-sEdge);
    if(it.inner==='schub' && it.kind==='base'){
      const zd=z1-(z1-z0)*DRAWER_TOP, t=Math.min(g.d-60, 520);
      out.push({what:'Auszug', poly:[o,h,add(h,mul(n,t)),add(o,mul(n,t))], z0:zd, z1, t, pl:o, pr:h, n, corner:true});
      z1=zd;
    }
    out.push({what:'Tür', poly:swing90(h, unit(sub(o,h)), n, r), z0, z1, hinge:h, side:'corner', r, along:unit(sub(o,h)), n});
    return out;
  }
  if(tallDev(it)){
    // Hochschrank mit Gerät: Schranktüren unter und über dem Gerät (Angel
    // nach Anschlag), dazwischen die Gerätetür – dieselben Höhen wie die
    // Fronten (devSegs, gleiche Fuge). Spülmaschine und Backofen klappen
    // nach unten, die Mikrowelle schwenkt zur Seite (Türanschlag links, wie
    // die gängigen Einbau-Mikrowellen).
    const sg=devSegs(it,S), gap=3, z1=g.z1, zd=Math.max(sg.z0, sg.zd), zt=Math.max(zd, sg.zt);
    const swing=(right, z0_, z1_, extra)=>{ const h=right?pr:pl, o=right?pl:pr, al=unit(sub(o,h));
      out.push({what:'Tür', poly:swing90(h, al, n, w), z0:z0_, z1:z1_, hinge:h, side:right?'right':'left', r:w, along:al, n, deg:90, ...extra}); };
    const right=it.hinge==='right';
    if(zd-sg.z0>gap) swing(right, sg.z0, zd);
    if(zt-zd>gap){
      if(it.dev==='mw') swing(false, zd, zt, {what:'Mikrowellentür', dev:'mw'});
      else { const t = it.dev==='dw' ? 600 : 500;
        out.push({what: it.dev==='dw'?'Spülmaschinentür':'Backofentür', poly:[pl,pr,add(pr,mul(n,t)),add(pl,mul(n,t))], z0:zd, z1:zd+80, dev:it.dev}); }
    }
    if(z1-zt>gap) swing(right, zt, z1);
    return out;
  }
  const fz=fzOf(it);
  if(fz){
    // Zwei Flügel, Angeln außen, beide schwenken nach außen. Hülle 0–90°;
    // wie weit sie darüber hinaus aufgehen, misst die Prüfung (leafReach).
    const zl0 = it.fz==='fd' ? Math.min(fz.drawerZ, g.z1-300) : 20;
    leaves(g).forEach(lf=>{
      const R=[]; for(let a=0;a<=90;a+=10) R.push(...leafRect(lf, a*Math.PI/180));
      out.push({what:'Tür', leaf:lf, name:lf.name, poly:TL.hull(R), z0:lf.z0!=null?lf.z0:zl0, z1:lf.z1!=null?lf.z1:g.z1-10,
                hinge:lf.P, r:lf.W, t:lf.t, along:lf.along, n, open90:leafRect(lf, Math.PI/2)});
    });
    // French Door: Gefrierschubladen darunter, gerade ausgezogen
    // (Samsung RF28R6222WW: offen ≈ 480 vor der Türfront).
    if(it.fz==='fd') out.push({what:'Auszug', poly:[pl,pr,add(pr,mul(n,480)),add(pl,mul(n,480))], z0:20, z1:zl0, t:480, pl, pr, n,
                               zp:10+(zl0-10)*FD_LOW});   // obere Lade wie frontsOf (dort ab 10)
    return out;
  }
  const zf0=g.z0+(it.kind==='wall'?0:S.plinth), zf1=it.kind==='base' ? D.workH-S.topT : it.kind==='island' ? g.z1-S.topT : g.z1;
  if(fk==='door'){
    // Bis 600 eine Tür, darüber zwei (Anschlag außen). Kühlschrank: eine.
    const doors = (w>600 && !isCold(it)) ? [['left',pl,pr,w/2],['right',pr,pl,w/2]]
                : [[it.hinge||'left', it.hinge==='right'?pr:pl, it.hinge==='right'?pl:pr, w]];
    const deg=swingOf(it);
    doors.forEach(([side,h,other,r])=>out.push({what:'Tür', poly:swing90(h, unit(sub(other,h)), n, r, deg), z0:zf0, z1:zf1, hinge:h, side, r, along:unit(sub(other,h)), n, deg}));
  } else if(fk==='drawer'){
    const t=Math.min(g.d-60, 520);
    out.push({what:'Auszug', poly:[pl,pr,add(pr,mul(n,t)),add(pl,mul(n,t))], z0:zf0, z1:zf1, t, pl, pr, n,
              zp:zf1-(zf1-zf0)*DRAWER_TOP});   // gezogen: die oberste Lade (Hülle bleibt die ganze Front)
  } else if(fk==='flap'){
    if(it.kind!=='wall'){
      const t=Math.min(zf1-zf0, 450);
      out.push({what:'Klappe', poly:[pl,pr,add(pr,mul(n,t)),add(pl,mul(n,t))], z0:zf0, z1:zf0+80});
    }
  } else if(fk==='flapdown'){
    // Gerätetür klappt nach unten: liegt offen waagerecht vor der Front.
    // Geschirrspüler 45/60: offen 1150/1200 ab Rückwand (BSH-Maßblatt),
    // also ≈ 600 vor der Front. Backofen ≈ 500.
    const t = it.dev==='dw' ? 600 : 500;
    const zh = devZ(it,S)!=null ? devZ(it,S) : it.dev==='dw' ? S.plinth : ovenZ(zf0,zf1);
    out.push({what: it.dev==='dw'?'Spülmaschinentür':'Backofentür', poly:[pl,pr,add(pr,mul(n,t)),add(pl,mul(n,t))], z0:zh, z1:zh+80, dev:it.dev});
  }
  return out;
}

// ---------- Arbeitsplatten ----------
// Je Wand laufen aneinanderstoßende Unterschränke zu einer Zeile zusammen;
// darüber liegt EINE Platte (Tiefe topD ab Wand). An Innenecken läuft die
// längere Platte durch, die andere stößt an ihre Vorderkante.
function worktops(E, K, G, fillers=[]){
  const S=K.spec, D=derived(S), runs=[];
  const byWall=new Map();
  G.filter(g=>!g.free && g.it.kind==='base').forEach(g=>{
    const k=g.Wf.key; if(!byWall.has(k)) byWall.set(k,[]); byWall.get(k).push(g);
  });
  // Hochschrank derselben Wand in der Lücke a..b: dort endet die Platte (wie am
  // Zeilenende unten), sie läuft nicht über ihn, er ist keine Passleiste.
  const tallIn=(key,a,b)=>G.some(h=>!h.free && h.Wf.key===key && h.it.kind==='tall' && h.s0<b-1 && h.s1>a+1);
  byWall.forEach(list=>{
    list.sort((p,q)=>p.s0-q.s0);
    let cur=null;
    list.forEach(g=>{
      // Bis 150 mm Lücke bleibt es EINE Zeile: die Lücke wird eine Passleiste,
      // die Platte läuft darüber durch – außer ein Hochschrank steht darin.
      if(cur && g.s0<=cur.s1+150 && !(g.s0>cur.s1+1 && tallIn(g.Wf.key, cur.s1, g.s0))){ if(g.s0>cur.s1+1) fillers.push({Wf:g.Wf, s0:cur.s1, s1:g.s0, w:g.s0-cur.s1, between:[cur.ids[cur.ids.length-1], g.it.id]});
        cur.s1=Math.max(cur.s1,g.s1); cur.ids.push(g.it.id); }
      else { cur={Wf:g.Wf, s0:g.s0, s1:g.s1, ids:[g.it.id]}; runs.push(cur); }
    });
  });
  // Welche Zeile läuft in die Ecke? Die läuft durch, die andere stößt an
  // ihre Vorderkante. Erst danach zählt die Länge.
  runs.forEach(r=>{ r.len=r.s1-r.s0;
    r.corner = r.s0<=cornerStop(E,r.Wf,S.baseD,0)+10 || r.s1>=r.Wf.L-cornerStop(E,r.Wf,S.baseD,1)-10; });
  runs.sort((p,q)=>(q.corner-p.corner) || (q.len-p.len));
  const polyOf=r=>[wpt(r.Wf,r.s0,0), wpt(r.Wf,r.s1,0), wpt(r.Wf,r.s1,S.topD), wpt(r.Wf,r.s0,S.topD)];
  const done=[];
  const stripOf=r=>[wpt(r.Wf,-1e5,0),wpt(r.Wf,1e5,0),wpt(r.Wf,1e5,S.topD),wpt(r.Wf,-1e5,S.topD)];
  runs.forEach(r=>{
    const o0=r.s0, o1=r.s1;
    for(const e of done){
      // Auch knapp daneben (Passblende) gilt als Ecke: Streifen um PASS verlängert prüfen.
      const rx={...r, s0:r.s0-PASS-10, s1:r.s1+PASS+10};
      if(!TL.convexOverlap(polyOf(rx), polyOf(e), 0.5)){
        // Umgekehrt: die schon fertige Platte e endet mit Passblende vor r
        // (sie lief nicht in die Ecke) – dann zieht e bis an die Vorderkante von r.
        const ex={...e, s0:e.s0-PASS-10, s1:e.s1+PASS+10};
        if(!TL.convexOverlap(polyOf(ex), polyOf(r), 0.5)) continue;
        const c2=TL.clipConvex(polyOf(r), stripOf(e)); if(c2.length<3) continue;
        const q=c2.map(p=>dot(sub(p,e.Wf.A), e.Wf.u)), r0=Math.min(...q), r1=Math.max(...q);
        if((r0+r1)/2 < (e.s0+e.s1)/2){ if(e.s0>r1 && e.s0-r1<=PASS+10){ fillers.push({Wf:e.Wf, s0:r1, s1:e.s0, w:e.s0-r1, corner:true}); e.s0=r1; e.cornerCut0=true; } }
        else if(e.s1<r0 && r0-e.s1<=PASS+10){ fillers.push({Wf:e.Wf, s0:e.s1, s1:r0, w:r0-e.s1, corner:true}); e.s1=r0; e.cornerCut1=true; }
        continue;
      }
      // Nur der Teil von e im Tiefenstreifen von r zählt.
      const strip=[wpt(r.Wf,-1e5,0),wpt(r.Wf,1e5,0),wpt(r.Wf,1e5,S.topD),wpt(r.Wf,-1e5,S.topD)];
      const cut=TL.clipConvex(polyOf(e), strip); if(cut.length<3) continue;
      const pr=cut.map(p=>dot(sub(p,r.Wf.A), r.Wf.u)), e0=Math.min(...pr), e1=Math.max(...pr);
      // Passblende in der Ecke: die Querplatte läuft bis an die Vorderkante
      // der durchlaufenden Platte, damit kein Loch bleibt.
      if((e0+e1)/2 < (r.s0+r.s1)/2) r.cornerCut0=true; else r.cornerCut1=true;
      if((e0+e1)/2 < (r.s0+r.s1)/2) r.s0 = (r.s0>e1 && r.s0-e1<=PASS+10) ? e1 : Math.max(r.s0, e1);
      else r.s1 = (r.s1<e0 && e0-r.s1<=PASS+10) ? e0 : Math.min(r.s1, e0);
    }
    // Passblende in der Ecke: als Teil in die Stückliste
    if(r.cornerCut0 && o0-r.s0>1) fillers.push({Wf:r.Wf, s0:r.s0, s1:o0, w:o0-r.s0, corner:true});
    if(r.cornerCut1 && r.s1-o1>1) fillers.push({Wf:r.Wf, s0:o1, s1:r.s1, w:r.s1-o1, corner:true});
    if(r.s1-r.s0>20) done.push(r);
  });
  done.forEach(r=>{
    const stops0=[cornerStop(E,r.Wf,S.baseD,0)], stops1=[r.Wf.L-cornerStop(E,r.Wf,S.baseD,1)];
    G.forEach(g=>{ if(g.free || g.Wf.key!==r.Wf.key || g.it.kind!=='tall') return; if(g.s1<=r.s0+1) stops0.push(g.s1); if(g.s0>=r.s1-1) stops1.push(g.s0); });
    E.openings.forEach(o=>{ const on=openingOn(E,o,r.Wf); if(!on || !(o.kind==='door'||o.kind==='hole')) return; if(on.s1<=r.s0+1) stops0.push(on.s1); if(on.s0>=r.s1-1) stops1.push(on.s0); });
    // Vorderkante einer Querplatte an der Ecke ist auch ein Anschlag.
    done.forEach(e=>{ if(e===r || e.Wf.key===r.Wf.key) return; const cut=TL.clipConvex(polyOf(e), stripOf(r)); if(cut.length<3) return;
      const pr=cut.map(p=>dot(sub(p,r.Wf.A), r.Wf.u)), e0=Math.min(...pr), e1=Math.max(...pr);
      if(e1<=r.s0+1) stops0.push(e1); if(e0>=r.s1-1) stops1.push(e0); });
    const a=Math.max(...stops0), b=Math.min(...stops1);
    if(!r.cornerCut0 && r.s0-a>1 && r.s0-a<=150){ fillers.push({Wf:r.Wf, s0:a, s1:r.s0, w:r.s0-a, end:true}); r.s0=a; }
    if(!r.cornerCut1 && b-r.s1>1 && b-r.s1<=150){ fillers.push({Wf:r.Wf, s0:r.s1, s1:b, w:b-r.s1, end:true}); r.s1=b; }
  });
  // Stumpfe Innenecke (über 90°): Die durchlaufende Platte endet rechtwinklig an der
  // Ecke C, die Querplatte an der Vorderecke F der durchlaufenden – dazwischen bliebe
  // das Dreieck C–P–F (P = Fußpunkt von F an der Nachbarwand) ohne Platte. Es gehört
  // zur durchlaufenden Platte, die damit bis an die Nachbarwand reicht (ohne Gehrung);
  // ihr Umriss wird ein konvexes Fünfeck. Zeile (s0, s1) und Querplatte bleiben.
  // Nur, wo die Platte bis in die Ecke läuft und die Querplatte genau an F anschließt
  // (Passblende), und ab 10 mm Lückenbreite (Messrauschen um 90° bleibt rechteckig).
  const wedgeAt=(e,k)=>{
    const id=k ? e.Wf.b : e.Wf.a;
    if(Math.abs((k?e.s1:e.s0)-(k?e.Wf.L:0))>1) return null;
    const Ec=P(E,id), F=wpt(e.Wf, k?e.s1:e.s0, S.topD), u1=k?mul(e.Wf.u,-1):e.Wf.u;
    for(const r of done){
      if(r===e || r.Wf.key===e.Wf.key || (r.Wf.a!==id && r.Wf.b!==id)) continue;
      const kr=r.Wf.a===id ? 0 : 1, u2=kr ? mul(r.Wf.u,-1) : r.Wf.u;
      if(!(dot(e.Wf.n,u2)>0) || -dot(u1,u2)*S.topD<=10) continue;        // keine stumpfe Innenecke oder zu schmal
      const sF=dot(sub(F,Ec),u2);
      if(!(sF>1) || Math.abs((kr ? r.Wf.L-r.s1 : r.s0)-sF)>1) continue;    // Querplatte schließt nicht an F an
      const Pt=add(Ec,mul(u2,sF));
      if(polyInRoom(E,[Ec,Pt,F])) return Pt;
    }
    return null;
  };
  const tops=done.map(r=>{
    let poly=polyOf(r), len=r.s1-r.s0;
    const w0=wedgeAt(r,0), w1=wedgeAt(r,1);
    if(w0 || w1){
      if(w0) poly=[...poly, w0];                                   // a0 a1 b1 b0 | P0
      if(w1) poly=[poly[0], poly[1], w1, ...poly.slice(2)];       // a0 a1 | P1 b1 b0
      const q=poly.map(p=>dot(sub(p,r.Wf.A), r.Wf.u)); len=Math.max(...q)-Math.min(...q);   // Zuschnitt: längste Ausdehnung
    }
    return {poly, z0:D.workH-S.topT, z1:D.workH, len, depth:S.topD, ids:r.ids, Wf:r.Wf, s0:r.s0, s1:r.s1};
  });
  // Inseln tragen ihre Platte selbst (ganzer Grundriss); bündig aneinander
  // stehende Inseln eine gemeinsame (islandTops).
  islandTops(G, S).forEach(t=>tops.push(t));
  return tops;
}
// Durchgehende Arbeitsplatte über Inseln, die bündig aneinanderstehen
// (Wunsch: „Kücheninselstücke sollten aneinander snappen können“ –
// „durchgehende Arbeitsplatte natürlich!“). Zusammen gehören Inseln gleicher
// Höhe (±1 mm), deren Platten (samt Tresen-Überstand) sich entlang einer
// Kante berühren: gegenläufige Kanten höchstens 2 mm auseinander, mind.
// 20 mm gemeinsam, ohne Überlappung. Solche Platten liegen zwangsläufig
// achsparallel zueinander; ihr Umriss entsteht auf dem Raster ihrer Kanten
// (Rechtecke vereinigen, Randkanten verketten). Eintrag je Gruppe:
// poly = Umriss (auch L/T, nicht konvex), parts = die Platten der einzelnen
// Inseln (konvex, fürs 3D), edges = Umrisskanten ohne Fuge. Länge × Tiefe:
// ist der Umriss ein Rechteck, dessen Seiten; sonst Summe der Längen ×
// größte Tiefe (Material am Stück). Einzelne Inseln wie bisher.
function topsTouch(A, B){
  if(TL.convexOverlap(A, B, 1)) return false;
  const eb=TL.edgesOf(B);
  return TL.edgesOf(A).some(a=>eb.some(b=>{
    if(dot(a.d,b.d)>-0.9999) return false;
    if(Math.abs(dot(sub(b.a,a.a),a.n))>2 || Math.abs(dot(sub(b.b,a.a),a.n))>2) return false;
    const la=len(sub(a.b,a.a)), t0=dot(sub(b.a,a.a),a.d), t1=dot(sub(b.b,a.a),a.d);
    return Math.min(la, Math.max(t0,t1)) - Math.max(0, Math.min(t0,t1)) >= 20;
  }));
}
function islandTops(G, S){
  const I=G.filter(g=>g.it.kind==='island'), F=g=>g.foot||g.poly;
  const up=I.map((_,i)=>i), root=i=>up[i]===i ? i : (up[i]=root(up[i]));
  for(let i=0;i<I.length;i++) for(let j=i+1;j<I.length;j++)
    if(Math.abs(I[i].z1-I[j].z1)<=1 && topsTouch(F(I[i]),F(I[j]))) up[root(j)]=root(i);
  const groups=new Map();
  I.forEach((g,i)=>{ const r=root(i); if(!groups.has(r)) groups.set(r,[]); groups.get(r).push(g); });
  return [...groups.values()].map(grp=>{
    const g0=grp[0];
    if(grp.length===1) return {poly:F(g0), z0:g0.z1-S.topT, z1:g0.z1, len:g0.it.w, depth:g0.d+(g0.bar||0), ids:[g0.it.id], island:true};
    const parts=grp.map(F), o=parts[0][0], a=unit(sub(parts[0][1],o)), b={x:-a.y, y:a.x};
    const loc=p=>({x:dot(sub(p,o),a), y:dot(sub(p,o),b)}), wrl=(x,y)=>add(o, add(mul(a,x), mul(b,y)));
    // Rasterlinien (Kanten bis 2 mm auseinander gelten als eine).
    const lines=vs=>{ const s=[...vs].sort((p,q)=>p-q), out=[]; s.forEach(v=>{ const l=out[out.length-1]; if(l && v-l.v<=2){ l.n++; l.sum+=v; } else out.push({v, n:1, sum:v}); }); return out.map(l=>l.sum/l.n); };
    const R=parts.map(P=>{ const q=P.map(loc); return {x0:Math.min(...q.map(p=>p.x)), x1:Math.max(...q.map(p=>p.x)), y0:Math.min(...q.map(p=>p.y)), y1:Math.max(...q.map(p=>p.y))}; });
    const xs=lines(R.flatMap(r=>[r.x0,r.x1])), ys=lines(R.flatMap(r=>[r.y0,r.y1]));
    const ix=v=>xs.reduce((k,x,i)=>Math.abs(x-v)<Math.abs(xs[k]-v)?i:k,0), iy=v=>ys.reduce((k,y,i)=>Math.abs(y-v)<Math.abs(ys[k]-v)?i:k,0);
    const RI=R.map(r=>({i0:ix(r.x0), i1:ix(r.x1), j0:iy(r.y0), j1:iy(r.y1)}));
    const full=(i,j)=>i>=0 && j>=0 && i<xs.length-1 && j<ys.length-1 && RI.some(r=>i>=r.i0 && i<r.i1 && j>=r.j0 && j<r.j1);
    // Randkanten der Zellen, gegen den Uhrzeigersinn um die Fläche (im a/b-Rahmen).
    const E_=[];
    for(let i=0;i<xs.length-1;i++) for(let j=0;j<ys.length-1;j++){ if(!full(i,j)) continue;
      if(!full(i,j-1)) E_.push([[i,j],[i+1,j]]);
      if(!full(i+1,j)) E_.push([[i+1,j],[i+1,j+1]]);
      if(!full(i,j+1)) E_.push([[i+1,j+1],[i,j+1]]);
      if(!full(i-1,j)) E_.push([[i,j+1],[i,j]]); }
    const key=v=>v[0]+','+v[1], from=new Map();
    E_.forEach(e=>{ const k=key(e[0]); if(!from.has(k)) from.set(k,[]); from.get(k).push(e); });
    const used=new Set(), rings=[];
    E_.forEach(e0=>{ if(used.has(e0)) return; const ring=[]; let e=e0;
      while(e && !used.has(e)){ used.add(e); ring.push(e[0]); e=(from.get(key(e[1]))||[]).find(x=>!used.has(x)); }
      // Ecken ohne Richtungswechsel weglassen.
      const n=ring.length, keep=ring.filter((v,k)=>{ const p=ring[(k+n-1)%n], q=ring[(k+1)%n];
        return (v[0]-p[0])*(q[1]-v[1])-(v[1]-p[1])*(q[0]-v[0])!==0; });
      if(keep.length>=3) rings.push(keep.map(v=>wrl(xs[v[0]], ys[v[1]]))); });
    rings.sort((p,q)=>Math.abs(TL.polyArea(q))-Math.abs(TL.polyArea(p)));
    const poly=rings[0]||parts[0], edges=rings.flatMap(r=>r.map((p,k)=>[p, r[(k+1)%r.length]]));
    const rect=rings.length===1 && poly.length===4, sd=rect ? [len(sub(poly[1],poly[0])), len(sub(poly[2],poly[1]))] : null;
    return {poly, parts, edges, z0:g0.z1-S.topT, z1:g0.z1,
            len: rect ? Math.max(...sd) : grp.reduce((s,g)=>s+g.it.w,0),
            depth: rect ? Math.min(...sd) : Math.max(...grp.map(g=>g.d+(g.bar||0))),
            ids:grp.map(g=>g.it.id), island:true, joined:true};
  });
}

// ---------- Layout = alles, was gezeichnet und geprüft wird ----------
function layout(E, K){
  const G=[], orphans=[];
  // Teile in den kanonischen Wandrahmen bringen (ältere Daten, Importe):
  // gleiche Lage, nur von der anderen Ecke aus gemessen.
  K.items.forEach(it=>{ if(!it.a) return; const W=E.wallsByKey.get(wallKeyOf(it.a,it.b));
    if(W && it.a!==W.a){ const Wf=wallFrame(E,W.a,W.b); if(Wf){ it.x=Wf.L-it.x-it.w; it.a=W.a; it.b=W.b; if(it.cEnd!=null) it.cEnd=1-it.cEnd; } } });
  K.items.forEach(it=>{ const g=geom(E,K,it); if(g) G.push(g); else orphans.push(it); });
  // Eckschränke: Tiefe der Querzeile für die Blende (statt Standardtiefe).
  G.forEach(g=>{ if(g.it.corner) g.cross=crossAt(E,K,G,g,cornerAtS0(g)); });
  // Über Eck / Diagonal: zweiter Schenkel als eigener Eintrag (wing).
  G.filter(g=>shapeOf(g.it)).forEach(g=>{ const wg=cornerWing(E,K,g); if(wg){ cornerShape(g,wg); G.push(wg); } });
  G.forEach(g=>{ if(!g.wing) g.env=envelopes(K,g); });
  const fillers=[], tops=worktops(E,K,G,fillers);
  // Diagonal-Eckschrank unten: die Platten der beiden Schenkel lassen vor dem
  // Eckfeld ein Dreieck bis zur Schräge frei – als Eckstück ergänzen.
  G.filter(g=>g.it.ctype==='diag' && g.it.kind==='base' && g.wingG).forEach(g=>{
    const S=K.spec, at=g.wingG.at, t=S.topD, e=g.it.w+g.d+(S.topD-S.baseD)*Math.SQRT2-t;
    if(e>t+1) tops.push({poly:[at(t,t), at(e,t), at(t,e)], z0:derived(S).workH-S.topT, z1:derived(S).workH, len:0, depth:0, ids:[g.it.id], patch:true});
  });
  return {G, byId:new Map(G.filter(g=>!g.wing).map(g=>[g.it.id,g])), tops, fillers, orphans, D:derived(K.spec)};
}

// ---------- Öffnungen in Wandkoordinaten ----------
function openingOn(E, o, Wf){
  if(wallKeyOf(o.a,o.b)!==Wf.key) return null;
  const A=P(E,o.a), B=P(E,o.b); if(!A||!B) return null;
  const L=len(sub(B,A)), u=unit(sub(B,A));
  const p0={x:A.x+u.x*o.x, y:A.y+u.y*o.x}, p1={x:A.x+u.x*(o.x+o.w), y:A.y+u.y*(o.x+o.w)};
  const s0=dot(sub(p0,Wf.A),Wf.u), s1=dot(sub(p1,Wf.A),Wf.u);
  return {s0:Math.min(s0,s1), s1:Math.max(s0,s1), z0:o.y||0, z1:(o.y||0)+o.h, o, L};
}
// Fensterflügel nach innen: je Flügel Angel, Breite, Schwenkbereich.
const SASH_IN=new Set(['turn','turntilt','stulp']);
function sashes(E, o){
  if(o.kind!=='window' || !o.swing || !SASH_IN.has(o.swing.type) || o.swing.out) return [];
  const Wf=wallFrame(E, o.a, o.b); if(!Wf) return [];
  const on=openingOn(E,o,Wf); if(!on) return [];
  const pA=wpt(Wf,on.s0,0), pB=wpt(Wf,on.s1,0), w=on.s1-on.s0;
  // hinge 'left' = Band an o.x (Seite o.a), wie doorSwing.
  const A=P(E,o.a), atA=dot(sub(A,Wf.A),Wf.u) < (on.s0+on.s1)/2;
  const hingeAtS0 = (o.swing.hinge!=='right') === atA;
  const list = o.swing.type==='stulp' ? [[pA,pB,w/2],[pB,pA,w/2]]
             : [hingeAtS0 ? [pA,pB,w] : [pB,pA,w]];
  return list.map(([h,other,r])=>({h, r, along:unit(sub(other,h)), n:Wf.n,
                                   poly:swing90(h, unit(sub(other,h)), Wf.n, r), z0:on.z0, z1:on.z1, o, Wf}));
}

// ---------- Prüfung ----------
// Jeder Befund: {lvl:'bad'|'warn'|'info', ids, txt, at (Weltpunkt)}.
// bad = geht so nicht (stößt an, passt nicht), warn = Richtwert verfehlt.
const LEVEL_ORDER={bad:0, warn:1, info:2};
const fzName=it=>{ const f=fzOf(it); return !f ? null : f.single ? (it.dev==='freezer' ? 'Gefrierschrank frei' : it.gf ? 'Kühl-Gefrier frei' : 'Kühlschrank frei') : f.label; };
const nameOf=it=>(fzName(it)||(it.dev==='hob' && it.kind==='base' && it.noOven ? 'Kochfeld' : it.dev==='dw' && it.kind==='tall' ? 'Spülmaschine hoch' : it.dev?DEV[it.dev].label:it.corner?(it.kind==='wall'?'Eckhängeschrank':'Eckschrank'):KIND[it.kind].label))+' '+Math.round(it.w/10);
// Für Meldungen: mit Lage, damit klar ist, welcher der Unterschränke gemeint ist.
const fmtM1=v=>(v/1000).toFixed(2).replace('.',',').replace(/0$/,'');
// Ohne Wandbuchstaben (Meldung M-20261109-145224-3ebe3b): in der Küche ist
// keine Wand beschriftet. Welches Teil gemeint ist, zeigt der Klick auf den
// Befund (wählt es) und die Marke im Plan.
const labelOf=it=>nameOf(it);
// Strahl gegen ein einzelnes Teil: dieselbe Schnittformel wie gegen die Wand
// (TL.rayToRing), aber schon ab 1e-6 mm - ein Teil dicht am Start zählt, die
// Wand erst ab 1 mm. Gibt nur den Abstand t, null ohne Treffer.
function rayPoly(p, d, poly){ const r=TL.rayToRing(poly, p, d, 1e-6); return r ? r.t : null; }
const inRoom=(E,p)=>TL.pointInRoom(p, E.ring);
// 0,5 mm Toleranz: Rückkanten liegen kollinear auf schiefen Wänden, und
// Rundungsrauschen darf dort nicht als „ragt aus dem Raum“ zählen.
function polyInRoom(E, poly){
  const c=centroid(poly), Q=poly.map(p=>{ const v=sub(c,p), l=len(v)||1; return add(p, mul(v, Math.min(0.5, l/2)/l)); });
  if(!Q.every(p=>inRoom(E,p))) return false;
  for(const R of TL.ringsOf(E.ring)) for(let i=0;i<R.length;i++)
    for(let j=0;j<Q.length;j++) if(C.segCross(R[i],R[(i+1)%R.length],Q[j],Q[(j+1)%Q.length])) return false;
  // Ein Pfeiler ganz unter dem Teil kreuzt keine Kante: einzeln prüfen.
  for(const h of (E.ring.holes||[])){ const hc=centroid(h), q={x:h[0].x+(hc.x-h[0].x)*1e-3, y:h[0].y+(hc.y-h[0].y)*1e-3}; if(TL.pointInRing(q, Q)) return false; }
  return true;
}
const centroid=P=>({x:P.reduce((s,p)=>s+p.x,0)/P.length, y:P.reduce((s,p)=>s+p.y,0)/P.length});
function freeAhead(E, L, g, p, skipId, info){
  let best=TL.rayToRing(E.ring, p, g.n); let t=best?best.t:Infinity, hit=null;
  L.G.forEach(h=>{ if(h.it.id===skipId || h.it.kind==='wall') return; const r=rayPoly(p,g.n,h.foot||h.poly); if(r!=null && r<t){ t=r; hit=h; } });
  if(info) info.hit=hit;
  return t;
}
// Plattenkante statt Korpusfront: NKBA Guideline 6 misst den Gang zwischen
// „counter frontage, tall cabinets and/or appliances“, und die Platte steht
// bei topD > baseD vor dem Korpus über. topOf = Platte der Zeile, in der der
// Unterschrank g steht (Insel und Hochschrank tragen ihre Kante selbst);
// frontage = was an g Platz braucht (Korpus bzw. Insel samt Tresen, dazu die Platte).
function topOf(L, g){
  if(g.free || g.it.kind!=='base' || !g.Wf) return null;
  return L.tops.find(t=>!t.island && !t.patch && t.Wf && t.Wf.key===g.Wf.key && t.ids.includes(g.it.id)) || null;
}
const frontage=(L, g)=>{ const t=topOf(L,g); return t ? [g.foot||g.poly, t.poly] : [g.foot||g.poly]; };
// Punkt im Polygon oder höchstens 0,01 mm daneben: auf der Kante zählt als drin. Eine
// Stichprobe genau auf der Kante einer Querplatte (Spüle mittig, Platte 600 tief)
// läge sonst in gedrehten Räumen je nach Rauschen davor oder daneben.
function inPolyTol(p, P){
  if(TL.pointInRing(p, P)) return true;
  // Abstand zur Kante mit Skalaren (kein Zwischenobjekt je Kante: check ruft das je Probe und Teil auf, die
  // Objektkette kostete bei 40 Teilen rund ein Drittel der Prüfzeit).
  const n=P.length;
  for(let i=0;i<n;i++){
    const a=P[i], b=P[i+1===n ? 0 : i+1], ex=b.x-a.x, ey=b.y-a.y, dx=p.x-a.x, dy=p.y-a.y;
    let t=(dx*ex+dy*ey)/(ex*ex+ey*ey || 1); t=t<0 ? 0 : t>1 ? 1 : t;
    const qx=dx-ex*t, qy=dy-ey*t;
    if(qx*qx+qy*qy<=0.0001) return true;
  }
  return false;
}
// Arbeitsfläche zwischen Spüle a und Kochfeld b (Blum: Vorbereitungszone, NKBA
// Guideline 12): die längste durchgehende Platte zwischen ihren Kanten, ohne
// Strecken, die andere Spülen oder Kochfelder belegen; Hochschränke, Lücken und
// leere Wand zählen nicht. An einer rechtwinkligen Innenecke läuft die Platte
// beider Wände zusammen (das Eckquadrat einmal). null = nicht messbar (Insel:
// die Lage des Geräts darin ist nicht modelliert; nicht benachbarte Wände;
// schiefe oder äußere Ecke).
function prepBetween(L, a, b){
  if(a.free || b.free || !a.Wf || !b.Wf) return null;
  const depthOf=Wf=>Math.max(0, ...L.tops.filter(t=>!t.island && !t.patch && t.Wf && t.Wf.key===Wf.key).map(t=>t.depth));
  // Teil des Polygons P im Tiefenstreifen der Wand Wf, als Strecke entlang Wf.
  const span=(P, Wf, d)=>{
    if(!(d>0)) return null;
    const cut=TL.clipConvex(P, [wpt(Wf,-1e5,0), wpt(Wf,1e5,0), wpt(Wf,1e5,d), wpt(Wf,-1e5,d)]); if(cut.length<3) return null;
    const pr=cut.map(p=>dot(sub(p,Wf.A),Wf.u)), lo=Math.min(...pr), hi=Math.max(...pr);
    return hi-lo>1 ? [lo,hi] : null; };
  // Platten entlang Wf (eigene, dazu die Eckquadrate der Nachbarwände), zusammengefasst.
  const cover=Wf=>{ const d=depthOf(Wf), iv=[];
    L.tops.forEach(t=>{ if(t.island || t.patch || !t.Wf) return; const s=t.Wf.key===Wf.key ? [t.s0,t.s1] : span(t.poly,Wf,d); if(s) iv.push(s); });
    iv.sort((p,q)=>p[0]-q[0]);
    const out=[]; iv.forEach(s=>{ const l=out[out.length-1]; if(l && s[0]<=l[1]+1) l[1]=Math.max(l[1],s[1]); else out.push([s[0],s[1]]); });
    return out; };
  // Spülen und Kochfelder belegen die Platte (die Spülmaschine liegt darunter).
  // An der eigenen Wand zählen die exakten Maße s0/s1: eine Projektion des
  // Polygons liegt in gedrehten Räumen um 1e-11 daneben und kürzte genau 900 auf 899,99….
  const occ=Wf=>{ const d=depthOf(Wf); return L.G.filter(h=>!h.free && !h.wing && h.it.kind==='base' && (h.it.dev==='sink' || h.it.dev==='hob')).map(h=>h.Wf.key===Wf.key ? [h.s0,h.s1] : span(h.poly,Wf,d)).filter(Boolean); };
  // Stücke der Platte in [lo,hi] ohne die belegten Strecken.
  const pieces=(Wf, lo, hi)=>{ let segs=[]; cover(Wf).forEach(([c0,c1])=>{ const x0=Math.max(c0,lo), x1=Math.min(c1,hi); if(x1-x0>0) segs.push([x0,x1]); });
    occ(Wf).forEach(([o0,o1])=>{ const nx=[]; segs.forEach(([x0,x1])=>{ if(o1<=x0 || o0>=x1){ nx.push([x0,x1]); return; } if(o0>x0) nx.push([x0,o0]); if(o1<x1) nx.push([o1,x1]); }); segs=nx; });
    return segs; };
  const longest=ps=>ps.reduce((m,s)=>Math.max(m,s[1]-s[0]), 0);
  const A=a.Wf, B=b.Wf;
  if(A.key===B.key){
    const [p,q]=a.s0<=b.s0 ? [a,b] : [b,a];
    return q.s0>p.s1 ? longest(pieces(A, p.s1, q.s0)) : 0;
  }
  const c=[A.a,A.b].find(id=>id===B.a || id===B.b); if(!c) return null;
  const atA0=c===A.a, atB0=c===B.a, ua=atA0 ? A.u : mul(A.u,-1), ub=atB0 ? B.u : mul(B.u,-1);
  if(Math.abs(dot(A.u,B.u))>0.05 || dot(ub,A.n)<0.9 || dot(ua,B.n)<0.9) return null;
  const pa=pieces(A, atA0 ? 0 : a.s1, atA0 ? a.s0 : A.L), pb=pieces(B, atB0 ? 0 : b.s1, atB0 ? b.s0 : B.L);
  // Das Stück, das bis in die Ecke reicht, setzt sich an der Nachbarwand fort.
  const ta=pa.find(s=>atA0 ? s[0]<=1.5 : s[1]>=A.L-1.5), tb=pb.find(s=>atB0 ? s[0]<=1.5 : s[1]>=B.L-1.5);
  let best=Math.max(longest(pa), longest(pb));
  if(ta && tb) best=Math.max(best, (ta[1]-ta[0])+(tb[1]-tb[0])-Math.max(depthOf(A),depthOf(B)));
  return best;
}

// Tresen: Knieraum je Platz nach NKBA Kitchen Planning Guideline 9 (2022):
// 30″-Tisch 457 mm, 36″-Theke 381 mm, 42″-Bar 305 mm tief, je 610 mm breit.
const BAR_SEAT_W=610;
const barNkba=h=>h<=840 ? 457 : h<=990 ? 381 : 305;
const barSeats=g=>g.bar>0 ? Math.floor(g.it.w/BAR_SEAT_W) : 0;
// Andocken (Meldung 2dbf5c): eine Stirnseite der Insel bündig an die Wand,
// Längsachse senkrecht dazu - die Auszüge gehen dann parallel zur Wand auf.
// Nur, wenn die Insel schon ungefähr quer zur Wand steht (35°).
function dockFree(E, K, it, tol){
  if(it.kind!=='island' || !E.F) return null;
  const g=geom(E,K,it); if(!g) return null;
  let best=null;
  E.wallsByKey.forEach(W=>{
    const Wf=wallFrame(E,W.a,W.b); if(!Wf) return;
    [1,-1].forEach(sg=>{
      const m=add(g.c, mul(g.u, sg*it.w/2));
      const q=dot(sub(m,Wf.A),Wf.n), sAt=dot(sub(m,Wf.A),Wf.u);
      if(Math.abs(q)>tol || sAt<g.d/2 || sAt>Wf.L-g.d/2) return;
      if(Math.abs(dot(g.u,Wf.n))<Math.cos(35*Math.PI/180)) return;
      if(best && Math.abs(q)>=Math.abs(best.q)) return;
      const u2=mul(Wf.n, -sg), c2=add(wpt(Wf,sAt,0), mul(Wf.n, it.w/2)), loc=TL.toLocal(E.F,c2);
      const rot=((Math.atan2(dot(u2,E.F.v), dot(u2,E.F.u))*180/Math.PI)%360+360)%360;
      best={q, x:loc.x, y:loc.y, rot:Math.round(rot*1000)/1000, wall:'die Wand'};
    });
  });
  return best;
}
// Inseln aneinander einrasten (Wunsch: „Kücheninselstücke sollten aneinander
// snappen können“). Kommt eine Seite der Insel it in Fangweite tol (mm) einer
// Seite einer anderen Insel, übernimmt sie deren Drehung – oder um 90°
// versetzt, je nachdem, was näher an der eigenen liegt (T/L), höchstens 35°
// weg – und liegt bündig an: Platte an Platte, also samt Tresen-Überstand
// (foot), der so nie in die Nachbarinsel ragt. Entlang der Kante rastet sie
// an den Enden (Korpus oder Platte) bündig oder mittig ein, wenn das in
// Fangweite liegt, sonst bleibt sie dort. Verworfen, wenn sie dann aus dem
// Raum ragt oder ein anderes Teil überlappt. Die Drehung wird exakt
// übernommen, damit die Kanten genau aufeinanderliegen (islandTops legt
// dann eine Platte drüber).
// -> {x, y, rot, q (Abstand vorher), with (id der Nachbarinsel), how} oder null.
function snapIsland(E, K, it, tol){
  if(it.kind!=='island' || !E.F) return null;
  const others=K.items.filter(o=>o.kind==='island' && o.id!==it.id);
  if(!others.length) return null;
  const rest=K.items.filter(o=>o.id!==it.id).map(o=>geom(E,K,o)).filter(Boolean);
  const angD=(p,q)=>{ const d=((p-q)%360+360)%360; return Math.min(d,360-d); };
  const ext=(P,ax)=>{ const v=P.map(p=>dot(p,ax)); return [Math.min(...v), Math.max(...v)]; };
  let best=null;
  others.forEach(o=>{
    const h=geom(E,K,o); if(!h) return;
    let rot=null, dr=Infinity;
    for(let k=0;k<4;k++){ const r=(((o.rot||0)+90*k)%360+360)%360, d=angD(r, it.rot||0); if(d<dr-1e-9){ dr=d; rot=r; } }
    if(dr>35) return;
    const m=geom(E,K,{...it, rot}); if(!m) return;
    const HF=h.foot||h.poly, MF=m.foot||m.poly, cross=angD(rot, o.rot||0)%180>1;
    [[h.u,h.n],[h.n,h.u]].forEach(([ax,tg], ai)=>{
      const [h0,h1]=ext(HF,ax), [m0,m1]=ext(MF,ax);
      [h1-m0, h0-m1].forEach(sh=>{
        if(Math.abs(sh)>tol || (best && Math.abs(sh)>=best.q)) return;
        const [ht0,ht1]=ext(HF,tg), [mt0,mt1]=ext(MF,tg), [hb0,hb1]=ext(h.poly,tg), [mb0,mb1]=ext(m.poly,tg);
        let ts=0, td=tol;
        [hb0-mb0, hb1-mb1, ht0-mt0, ht1-mt1, (hb0+hb1-mb0-mb1)/2].forEach(s=>{ if(Math.abs(s)<=td){ td=Math.abs(s); ts=s; } });
        if(Math.min(ht1,mt1+ts)-Math.max(ht0,mt0+ts) < 20) return;      // nur Ecke an Ecke
        const loc=TL.toLocal(E.F, add(m.c, add(mul(ax,sh), mul(tg,ts)))), t={...it, x:loc.x, y:loc.y, rot}, g=geom(E,K,t);
        if(!g || !polyInRoom(E, g.foot||g.poly) || rest.some(x=>partsClash(g,x))) return;
        best={q:Math.abs(sh), x:loc.x, y:loc.y, rot, with:o.id,
              how: cross ? 'quer' : ai===0 ? 'längs' : 'Seite an Seite'};
      });
    });
  });
  return best;
}

// ---------- Maße am gewählten Teil (Meldung M-20261109-135204-ffeecf) ----------
// Wandteile: Kette entlang der Wand, aber bis zur Wand, die man an den
// Enden wirklich vor sich hat - über einen Wandversatz hinweg (die Ecke a/b
// liegt dann mitten im Raum). Gemessen auf halber Korpustiefe.
// Freie Teile: von jeder Seite bis zur Wand oder zum nächsten Teil.
// Die Wandabstände tragen edit: was sich beim Ändern wie bewegt, und bis wohin
// (min/max: bis zum ersten Hindernis, siehe blockReach).
function rowOf(L, g){
  // Höhenband wie in KIND: Hängeschrank high, Unterschrank low. Der
  // Hochschrank (full) belegt beide Bänder und steht in beiden Zeilen. Seine
  // eigene Zeile bleibt die untere; Hängeschränke daneben bremsen ihn über
  // blockFits.
  const band=g.it.kind==='wall' ? 'high' : 'low', inBand=h=>{ const b=KIND[h.it.kind].band; return b==='full' || b===band; };
  return L.G.filter(h=>!h.free && h.Wf.key===g.Wf.key && inBand(h))
            .map(h=>({h, s0: h.Wf.a===g.Wf.a ? h.s0 : g.Wf.L-h.s1, s1: h.Wf.a===g.Wf.a ? h.s1 : g.Wf.L-h.s0}))
            .sort((p,q)=>p.s0-q.s0);
}
// Wie weit reicht die Wand auf Tiefe q über das Wandende hinaus (x0=-Reichweite,
// x1=L+Reichweite)? Negativ an einer spitzen Ecke: dort schneidet die
// Nachbarwand die Linie auf Tiefe q schon vor dem Wandende, die Kette beginnt
// erst dahinter (cornerStop).
function wallReach(E, Wf, end, q){
  // Spitze Ecke: der Start 2 mm innen läge hinter der Nachbarwand (ab 1 mm
  // Versatz), der Strahl träfe nichts oder erst eine Wand weit draußen und die
  // Kette finge an der Raumecke an.
  const cs=cornerStop(E, Wf, q, end);
  if(cs>=1) return -cs;
  // 2 mm innen starten: an einer gewöhnlichen Ecke liegt der Start sonst
  // auf der Nachbarwand, und der Strahl fände erst eine Wand weit draußen.
  const s=end ? Wf.L-2 : 2, d=end ? Wf.u : mul(Wf.u,-1);
  const r=TL.rayToRing(E.ring, wpt(Wf,s,q), d);
  const t=r ? r.t-2 : 0;
  return t>5 ? t : 0;
}
// Mit K begrenzt fitEdit die Eingabefelder auf das, was die harten Regeln
// zulassen; ohne K gelten nur die Grenzen der eigenen Zeile.
function chainDims(E, L, g, K){
  if(g.free) return null;
  const Wf=g.Wf, row=rowOf(L, g);
  const qr=Math.min(...row.map(r=>r.h.d))/2;
  let x0=-wallReach(E,Wf,0,qr), x1=Wf.L+wallReach(E,Wf,1,qr);
  // Spitze Ecke: die Kette beginnt hinter dem Wandende; ein Teil davor
  // (Bestand mit Befund) geht vor, sonst entstünde eine Scheinlücke.
  if(x0>0) x0=Math.min(x0, ...row.map(r=>r.s0));
  if(x1<Wf.L) x1=Math.max(x1, ...row.map(r=>r.s1));
  const xs=[...new Set([x0, ...row.flatMap(r=>[r.s0,r.s1]), x1].map(v=>Math.round(v*10)/10))].sort((p,q)=>p-q);
  const segs=[];
  for(let i=0;i<xs.length-1;i++){
    const a=xs[i], b=xs[i+1]; if(b-a<1) continue;
    const part=row.find(r=>Math.abs(r.s0-a)<0.5 && Math.abs(r.s1-b)<0.5);
    segs.push({a, b, gap:!part, part:part?part.h.it.id:null});
  }
  // Wandabstände: erste und letzte Lücke, wenn sie an x0 bzw. x1 stößt.
  // Bewegt wird der zusammenhängende Block daneben (Teile ohne Lücke).
  // Ein Block mit einem Eckschrank über Eck / diagonal hängt in der Ecke fest,
  // mit dem Hauptteil (wingG) wie mit dem zweiten Schenkel (wing): dann kein
  // Eingabefeld (sonst wanderte der Eckschrank aus der Ecke, bzw. das
  // Hauptteil an der anderen Wand mit).
  // Hängezeile: der Hochschrank steht in der Zeile (er belegt das Band), gehört aber zur unteren
  // Zeile und wird dort verstellt (mit deren Sperren, z. B. dem Eckschrank im Block). Hier ist er Anker
  // wie das Wandende: kein Teil eines Blocks, und die Lücke daneben ist ein Wandabstand des Blocks.
  const hang=g.it.kind==='wall', isTall=r=>KIND[r.h.it.kind].band==='full';
  // Nur die Hängezeile beginnt an der Lücke und hält vor dem Hochschrank an. Alle anderen Zeilen laufen wie bisher ab dem
  // Zeilenanfang: ein Teil mit zweitem Schenkel sperrt den Block auch dann, wenn es die Lücke um 0,5 bis 1 mm überlappt.
  const block=(at, dir)=>{ const ids=[]; let edge=hang ? at : null, pinned=false;
    let seq = dir>0 ? row : [...row].reverse();
    if(hang) seq = dir>0 ? seq.filter(r=>r.s0>=at-1) : seq.filter(r=>r.s1<=at+1);
    for(const r of seq){ const near = dir>0 ? r.s0 : r.s1;
      if(edge!=null && Math.abs(near-edge)>1) break;
      if(hang && isTall(r)) break;
      if(r.h.wing || r.h.wingG) pinned=true;
      ids.push(r.h.it.id); edge = dir>0 ? r.s1 : r.s0; }
    return {ids, edge, pinned}; };
  const first=segs[0], last=segs[segs.length-1];
  const lo=cornerStop(E,Wf,qr*2,0), hi=Wf.L-cornerStop(E,Wf,qr*2,1);
  if(row.length && first && first.gap && Math.abs(first.a-x0)<0.5){
    // Block ab Ecke-a-Seite: wandert mit +delta; Grenze ist das nächste Teil
    // dahinter oder das Wandende.
    const B=block(first.b,1), nb=row.find(r=>!B.ids.includes(r.h.it.id) && r.s0>=B.edge-1);
    const cur=first.b-first.a;
    const ed=B.ids.length && !B.pinned && fitEdit(E,K,L,{ids:B.ids, fa:Wf.a, side:0, cur, min:Math.max(0,lo-x0), max:cur+((nb?nb.s0:hi)-B.edge), wp:wpt(Wf,x0,qr)});
    if(ed) first.edit=ed;
  }
  if(row.length && last && last.gap && Math.abs(last.b-x1)<0.5 && last!==first){
    const B=block(last.a,-1), nb=[...row].reverse().find(r=>!B.ids.includes(r.h.it.id) && r.s1<=B.edge+1);
    const cur=last.b-last.a;
    const ed=B.ids.length && !B.pinned && fitEdit(E,K,L,{ids:B.ids, fa:Wf.a, side:1, cur, min:Math.max(0,x1-hi), max:cur+(B.edge-(nb?nb.s1:lo)), wp:wpt(Wf,x1,qr)});
    if(ed) last.edit=ed;
  }
  // Lücke zwischen einem Hochschrank und den Hängeschränken daneben (Hängezeile): der Hochschrank ist der
  // Anker, der Block der Hängeschränke wandert, bündig bis an ihn (min 0), sonst bis zum nächsten Teil.
  if(hang) segs.forEach((sg, i)=>{
    if(!sg.gap) return;
    const tallSeg=s=>{ const r=s && s.part!=null && row.find(q=>q.h.it.id===s.part); return r && isTall(r) ? r : null; };
    const aL=tallSeg(segs[i-1]), aR=tallSeg(segs[i+1]);
    if(!aL===!aR) return;                                  // beidseits oder keiner: kein Block, kein Feld
    const cur=sg.b-sg.a;
    if(aL){
      const B=block(sg.b,1), nb=row.find(r=>!B.ids.includes(r.h.it.id) && r.s0>=B.edge-1);
      const ed=B.ids.length && !B.pinned && fitEdit(E,K,L,{ids:B.ids, fa:Wf.a, side:0, cur, min:0, max:cur+((nb?nb.s0:hi)-B.edge), wp:null, anchor:aL.h.it.id});
      if(ed) sg.edit=ed;
    } else {
      const B=block(sg.a,-1), nb=[...row].reverse().find(r=>!B.ids.includes(r.h.it.id) && r.s1<=B.edge+1);
      const ed=B.ids.length && !B.pinned && fitEdit(E,K,L,{ids:B.ids, fa:Wf.a, side:1, cur, min:0, max:cur+(B.edge-(nb?nb.s1:lo)), wp:null, anchor:aR.h.it.id});
      if(ed) sg.edit=ed;
    }
  });
  return {Wf, xs, segs, x0, x1, q:Math.max(...row.map(r=>r.h.d))+260};
}
// Freies Teil: je Seite der Abstand nach außen bis Wand oder Teil. Weiter
// weg geht es höchstens um das, was auf der Gegenseite frei ist.
function freeDims(E, L, g){
  if(!g.free) return null;
  const P=g.foot||g.poly, c=centroid(P), out=[];
  for(let i=0;i<P.length;i++){
    const a=P[i], b=P[(i+1)%P.length], m=mul(add(a,b),0.5), n=unit(sub(m,c));
    const o=add(m, mul(n,-2));
    let t=Infinity, wall=true;
    const r=TL.rayToRing(E.ring, o, n); if(r) t=r.t-2;
    // Bis zur Plattenkante der Zeile, nicht bis zum Korpus: so misst auch der Gang in check (NKBA
    // counter frontage). Sonst zeigte das Maß 1220, der Gang war 1200, und 1200 eingetragen meldete „1180“.
    // Liegt der Strahlursprung schon in einem Teil samt Platte (die Kante dringt in die Platte der Zeile ein), ist der
    // Abstand 0, wie check ihn meldet; rayPoly lieferte dort die Austrittsdistanz und die Platte würde übergangen.
    L.G.forEach(h=>{ if(h.it.id===g.it.id || h.it.kind==='wall') return;
      frontage(L,h).forEach(P=>{ const x=inPolyTol(o,P) ? 0 : rayPoly(o,n,P); if(x!=null && x-2<t){ t=x-2; wall=false; } }); });
    out.push({p0:m, n, val:isFinite(t)?Math.max(0,t):null, wall});
  }
  out.forEach((d,i)=>{ if(d.val==null) return; d.p1=add(d.p0, mul(d.n,d.val));
    const opp=out[(i+2)%out.length];
    d.edit={id:g.it.id, n:d.n, wall:d.wall, cur:d.val, min:0, max:d.val+(opp && opp.val!=null ? opp.val : 0), wp:d.wall ? d.p1 : null}; });
  return out.filter(d=>d.val!=null);
}
// Die Teile, die ein Wandabstand-Edit bewegt, mit Vorzeichen: im kanonischen
// Rahmen der Kette (a===fa) laufen sie mit dem Block, ältere Daten mit der
// anderen Ecke als a gegenläufig.
const dimParts=(K, edit)=>edit.ids.map(id=>K.items.find(x=>x.id===id)).filter(Boolean).map(it=>({it, sg:it.a===edit.fa ? 1 : -1}));
// Passt der Block, um t mm entlang der Wand verschoben, samt dem ganzen Weg
// dorthin? Jedes Teil geht als überstrichenes Rechteck (Breite + |t|) durch
// fitsAt, also durch dieselben harten Regeln wie das Ziehen: Nachbarn, Querzeilen
// der Nachbarwand, Öffnungen und Zonen, Raum. Der Block selbst bleibt außen vor.
// Je länger der Weg, desto mehr Treffer - darum lässt sich die Grenze suchen.
function blockFits(E, K, L, parts, t){
  const ids=parts.map(p=>p.it.id), Ls={...L, G:L.G.filter(h=>!ids.includes(h.it.id))};
  return parts.every(({it, sg})=>{
    const Wf=wallFrame(E, it.a, it.b); if(!Wf) return true;
    const dx=sg*t;
    return fitsAt(E, K, Ls, {...it, w:it.w+Math.abs(dx)}, Wf, dx<0 ? it.x+dx : it.x);
  });
}
// Wie weit darf der Block in Richtung dir (+1/-1 entlang der Wand) höchstens
// wandern, wenn die eigene Zeile T mm erlaubt? Bis vors erste Hindernis, bündig.
// Passt er schon jetzt nicht (Bestand mit Befund), bleibt T: er soll von dort
// weg dürfen. Die harten Regeln lassen 1 mm Überlappung zu, die zieht die
// Suche wieder ab.
function blockReach(E, K, L, parts, dir, T){
  const fits=t=>blockFits(E, K, L, parts, dir*t);
  if(!(T>0) || fits(T) || !fits(0)) return T;
  let a=0, b=T;
  // Höchstens 64 Halbierungen: ab etwa 3e14 mm (korrupte Raumdatei) kommt b-a in Gleitkommazahlen nie unter 0,02,
  // die Schleife hinge sonst und fröre das Fenster ein.
  for(let i=0; i<64 && b-a>0.02; i++){ const m=(a+b)/2; if(fits(m)) a=m; else b=m; }
  return Math.max(0, Math.round((a-1)*10)/10);
}
// Grenzen eines Wandabstand-Edits auf das zurückführen, was die harten Regeln
// zulassen: die eigene Zeile und cornerStop kennen weder Querzeilen der
// Nachbarwand noch Türen. Ohne K bleibt es bei den Grenzen der Zeile. null,
// wenn danach nichts mehr zu verstellen bleibt.
function fitEdit(E, K, L, edit){
  if(!K) return edit;
  const parts=dimParts(K, edit); if(!parts.length) return edit;
  const s=edit.side===0 ? 1 : -1;               // v = cur + s·t, t = Weg des Blocks entlang der Wand
  const tLo=s>0 ? edit.min-edit.cur : edit.cur-edit.max, tHi=s>0 ? edit.max-edit.cur : edit.cur-edit.min;
  const rn=blockReach(E,K,L,parts,-1,-tLo), rp=blockReach(E,K,L,parts,1,tHi);
  if(rn<-tLo){ if(s>0) edit.min=edit.cur-rn; else edit.max=edit.cur+rn; }
  if(rp<tHi){ if(s>0) edit.max=edit.cur+rp; else edit.min=edit.cur-rp; }
  return edit.max-edit.min<0.5 ? null : edit;
}
// Wandabstand v prüfen, ohne etwas zu ändern: {ok} oder {ok:false, why} mit
// why 'range' (außerhalb [min,max]) oder 'fit' (dort passt der Block nicht).
// Passt der Block schon jetzt nicht, darf er trotzdem von dort weg. Ein
// Eckschrank über Eck / diagonal bleibt in seiner Ecke (chainDims bietet für
// so einen Block kein Feld an, hier zur Sicherheit auch für ein altes edit).
function dimCheck(E, K, edit, v){
  if(!(v>=edit.min-0.5 && v<=edit.max+0.5)) return {ok:false, why:'range'};
  if(edit.ids){
    const parts=dimParts(K, edit), dv=v-edit.cur, t=edit.side===0 ? dv : -dv;
    if(parts.length){ const L=layout(E, K);
      if(L.G.some(h=>(h.wing || h.wingG) && parts.some(p=>p.it.id===h.it.id))) return {ok:false, why:'fit'};
      if(blockFits(E,K,L,parts,0) && !blockFits(E,K,L,parts,t)) return {ok:false, why:'fit'}; }
  }
  return {ok:true};
}
// Wandabstand setzen: Wandteile (Block) entlang der Wand, freie Teile entlang
// der Seitennormalen. Gibt false, wenn der Wert nicht geht (dimCheck).
function applyDim(E, K, edit, v){
  if(!dimCheck(E, K, edit, v).ok) return false;
  const dv=v-edit.cur;
  if(edit.ids){
    const delta = edit.side===0 ? dv : -dv;
    edit.ids.forEach(id=>{ const it=K.items.find(x=>x.id===id); if(!it) return;
      const same = it.a===edit.fa;
      it.x=Math.round((it.x + (same?delta:-delta))*10)/10; });
    return true;
  }
  const it=K.items.find(x=>x.id===edit.id); if(!it || !E.F) return false;
  const mv=mul(edit.n, -dv);
  it.x=Math.round((it.x+dot(mv,E.F.u))*10)/10; it.y=Math.round((it.y+dot(mv,E.F.v))*10)/10;
  return true;
}
// Eingabe im Maßfeld, rein (ändert nichts, legt nichts auf den Undo-Stapel):
// {kind:'none'} keine Zahl oder unverändert, 'range' außerhalb [min,max],
// 'fit' passt dort nicht, 'ok' mit v. Erst danach darf snapshot() laufen.
function dimInput(E, K, edit, raw){
  const v=parseFloat(String(raw).replace(',','.'));
  if(!isFinite(v) || Math.abs(v-edit.cur)<0.5) return {kind:'none'};
  const r=dimCheck(E, K, edit, v);
  return r.ok ? {kind:'ok', v} : {kind:r.why};
}
// Welches Maß ist gemeint? Das Maß selbst bleibt, seine Zahlen ändern sich:
// Wandabstand der Kette = Wandecke und Seite (in der Hängezeile bei der Lücke am Hochschrank dazu dessen id), freies Teil = Teil und Richtung.
const dimKey=edit=>edit.ids ? `w|${edit.fa}|${edit.side}${edit.anchor!=null ? '|a'+edit.anchor : ''}` : `f|${edit.id}|${Math.round(edit.n.x*1000)}|${Math.round(edit.n.y*1000)}`;
// Bei offenem Maßfeld liest der Klick auf ein anderes Maß seinen Treffer aus den
// Maßen von vor dem Setzen. Gilt hier: derselbe Treffer, aus den frischen Maßen
// (hits). null, wenn es ihn nicht mehr gibt.
function dimResolve(hits, hit){ const k=dimKey(hit.edit); return (hits||[]).find(h=>dimKey(h.edit)===k) || null; }

// ---------- Harte Platzregeln je Teil ----------
// check() meldet sie rot, fitsAt weist die Stelle ab – beide über dieselben
// Helfer, damit Platzieren nicht dort landet, wo check sofort rot ist.
const zMeet=(g,on)=>g.z0<on.z1-1 && on.z0<g.z1-1;
// Zwei Teile überlappen bei gleicher Höhenlage (Tresen: samt Überstand).
const partsClash=(a,b)=>a.it.id!==b.it.id && bandsMeet(a,b) && TL.convexOverlap(a.foot||a.poly, b.foot||b.poly, 1);
// Öffnung an der Wand des Teils (on aus openingOn mit g.Wf): Tür/Durchgang
// zugestellt, Fenster verdeckt, Brüstung unter der Platte. Text oder null.
// (Höhe zählt: ein Hängeschrank über der Tür ist kein Hindernis.)
function openingOwnHit(D, g, on){
  if(!(g.s0<on.s1-1 && on.s0<g.s1-1)) return null;
  const k=on.o.kind;
  if(k==='door') return zMeet(g,on) ? `${nameOf(g.it)} steht vor einer Tür` : null;
  if(k==='hole') return zMeet(g,on) ? `${nameOf(g.it)} verdeckt einen Durchgang` : null;
  if(k!=='window') return null;
  if((g.it.kind==='wall'||g.it.kind==='tall') && zMeet(g,on)) return `${nameOf(g.it)} verdeckt ein Fenster`;
  if(g.it.kind==='base' && D.workH>on.z0+1) return `Arbeitsplatte (${mm(D.workH)} mm) liegt über der Brüstung (${mm(on.z0)} mm) des Fensters`;
  return null;
}
// Zone vor einer Öffnung, in die Teile anderer Wände (oder freie) nicht
// ragen dürfen: vor Türen und Durchgängen 600 mm, vor Fenstern 100 mm.
function openingZone(E, o){
  const Wf=wallFrame(E,o.a,o.b), on=Wf&&openingOn(E,o,Wf); if(!on) return null;
  const dq = o.kind==='window' ? 100 : 600;
  return {Wf, on, rq:[wpt(Wf,on.s0,0), wpt(Wf,on.s1,0), wpt(Wf,on.s1,dq), wpt(Wf,on.s0,dq)]};
}
// Zählt die Zone für ein Teil dieser Höhe? (Unterschrank unter der Brüstung nicht.)
const zoneMeets=(g,z)=>zMeet(g,z.on) && !(z.on.o.kind==='window' && g.it.kind==='base' && g.z1<=z.on.z0);
// Text, wenn das Teil (nicht an der Wand der Öffnung) in der Zone steht, sonst null.
function zoneHit(g, z){
  if(!g.free && g.Wf.key===z.Wf.key) return null;
  if(!zoneMeets(g,z) || !TL.convexOverlap(g.poly, z.rq, 1)) return null;
  const k=z.on.o.kind;
  return `${nameOf(g.it)} steht vor ${k==='window'?'einem Fenster':k==='door'?'einer Tür':'einem Durchgang'}${g.free?'':' an der Nachbarwand'}`;
}
// rec (optional): Liste, in die check die gemessenen Abstände legt, auch die guten:
// {k, a, b, val, lim, lvl:'ok'|'warn'|'bad', why}. Der Plan zeichnet sie als Schalter „Abstände“
// (NKBA); die Befunde selbst bleiben unverändert.
function check(E, K, L, rec){
  const S=K.spec, D=L.D, out=[];
  const gap_=(k, ids, a, dir, val, lim, lvl, why)=>{ if(rec) rec.push({k, ids, a, b:add(a, mul(dir, val)), val, lim, lvl, why}); };
  const add_=(lvl, ids, txt, at, fix)=>out.push({lvl, ids, txt, at, fix});
  const G=L.G;
  L.orphans.forEach(it=>add_('bad',[it.id], `${nameOf(it)} hängt an einer Wand, die es nicht mehr gibt`, null));
  // 1. Im Raum? Unter der Decke?
  G.forEach(g=>{
    if(!polyInRoom(E, g.foot||g.poly)) add_('bad',[g.it.id], `${nameOf(g.it)}${g.foot && polyInRoom(E,g.poly)?' (Tresen)':''} ragt aus dem Raum`, g.c);
    if(!g.free){
      const c=ceilMin(E,g.Wf,g.s0,g.s1);
      if(g.z1>c+1) add_('bad',[g.it.id], `${nameOf(g.it)} ist ${mm(g.z1)} mm hoch, die Decke dort ${mm(c)} mm`, g.c);
    }
  });
  // Hochschrank mit Gerät: Unterkante des Geräts (devZ) plus Gerätehöhe muss
  // in den Schrank passen; die Höhe ist ab 100 mm frei eingebbar. Abhilfe:
  // Standardhöhe, wenn die reicht, sonst die nötige Höhe – nur unter der Decke
  // und nur, wenn der Schrank so hoch an dieser Stelle kein Fenster verdeckt
  // (eigene Wand, Zone der Nachbarwand); sonst gäbe die Abhilfe gleich den
  // nächsten roten Befund. Dann bleibt nur Verschieben. Türen zählen hier
  // nicht: vor einer Tür ist der Schrank in jeder Höhe rot, eigener Befund.
  const zonesW=E.openings.filter(o=>o.kind==='window').map(o=>openingZone(E,o)).filter(Boolean);
  const blocksAt=(g,z1)=>{ const h={...g, z1};
    return (!g.free && E.openings.some(o=>{ const on=o.kind==='window' && openingOn(E,o,g.Wf); return on && openingOwnHit(D,h,on); }))
      || zonesW.some(z=>zoneHit(h,z)); };
  G.filter(g=>tallDev(g.it)).forEach(g=>{
    const sg=devSegs(g.it,S); if(sg.fits) return;
    const need=Math.ceil(sg.need/10)*10, ceil=g.free ? Infinity : ceilMin(E,g.Wf,g.s0,g.s1);
    const ok=z1=>z1<=ceil+1 && !blocksAt(g,z1);
    const fix = D.tallTop>=sg.need && ok(D.tallTop) ? {label:'Standardhöhe', id:g.it.id, set:{}, del:['h']}
      : ok(need) ? {label:`${mm(need)} mm hoch`, id:g.it.id, set:{h:need}} : null;
    add_('bad',[g.it.id], `${nameOf(g.it)}: Hochschrank zu niedrig für das Gerät – ${mm(g.z1)} mm, gebraucht ${mm(sg.need)} mm (Gerät ${mm(DEV_H[g.it.dev])} mm ab ${mm(devZ(g.it,S))} mm)${!fix && blocksAt(g,need) ? '; so hoch verdeckte er hier ein Fenster – verschieben' : ''}`, g.c, fix);
  });
  // Eckschrank über Eck / diagonal braucht eine rechtwinklige Innenecke,
  // bündig; sonst fehlt sein zweiter Schenkel. Abhilfe: in die Ecke setzen.
  G.filter(g=>shapeOf(g.it) && !g.free && !g.wing && !g.wingG).forEach(g=>{
    const x=cornerPlace(E,K,L,g.it,g.Wf), t=x!=null ? geom(E,K,{...g.it, x}) : null;
    const fix = t && cornerWing(E,K,t) ? {label:'In die Ecke', id:g.it.id, set:{x}} : null;
    add_('bad',[g.it.id], `${nameOf(g.it)} (${g.it.ctype==='diag'?'diagonal':'über Eck'}) muss bündig in einer rechtwinkligen Innenecke stehen, mit Platz für beide Schenkel`, g.c, fix);
  });
  // 2. Überlappung bei gleicher Höhenlage
  for(let i=0;i<G.length;i++) for(let j=i+1;j<G.length;j++){
    const a=G[i], b=G[j];
    // gleiche id: Eckschrank und sein zweiter Schenkel
    if(partsClash(a,b)) add_('bad',[a.it.id,b.it.id], `${nameOf(a.it)} und ${nameOf(b.it)} überlappen`, centroid([...a.poly,...b.poly]));
  }
  // 3. Öffnungen: Fenster verdeckt, Brüstung zu tief, Tür/Durchgang zugestellt
  G.filter(g=>!g.free).forEach(g=>{
    E.openings.forEach(o=>{
      const on=openingOn(E,o,g.Wf), t=on && openingOwnHit(D,g,on);
      if(t) add_('bad',[g.it.id], t, g.c);
    });
  });
  // Teile von anderen Wänden (oder frei), die vor einer Öffnung stehen.
  E.openings.forEach(o=>{
    const z=openingZone(E,o); if(!z) return;
    G.forEach(g=>{ const t=zoneHit(g,z); if(t) add_('bad',[g.it.id], t, g.c); });
  });
  // 4. Fensterflügel gegen Armatur, Hänge- und Hochschränke
  const sinks=G.filter(g=>g.it.dev==='sink');
  E.openings.forEach(o=>sashes(E,o).forEach(sa=>{
    sinks.forEach(g=>{
      const fp=faucetPoint(K,g), top=D.workH+(g.it.faucetH!=null?g.it.faucetH:S.faucetH);
      const q=25, sq=[{x:fp.x-q,y:fp.y-q},{x:fp.x+q,y:fp.y-q},{x:fp.x+q,y:fp.y+q},{x:fp.x-q,y:fp.y+q}];
      if(sa.z0<top-1 && TL.convexOverlap(sq, sa.poly, 1))
        add_('bad',[g.it.id], `Fensterflügel schlägt an die Armatur: Armatur bis ${mm(top)} mm, Flügel ab ${mm(sa.z0)} mm. Abhilfe: Vorfensterarmatur (umklappbar) oder Spüle seitlich versetzen`, fp, (D.workH+60<sa.z0-1 && (g.it.faucetH==null||g.it.faucetH>60)) ? {label:'Vorfensterarmatur', id:g.it.id, set:{faucetH:60}} : null);
    });
    G.forEach(g=>{
      if(g.it.dev==='sink' && !g.free) return;
      if(!bandsMeet(g, sa) || g.it.kind==='base' && g.z1<=sa.z0) return;
      if(TL.convexOverlap(g.poly, sa.poly, 1)) add_('bad',[g.it.id], `Fensterflügel schlägt an ${nameOf(g.it)}`, g.c);
    });
  }));
  // 5. Zimmertüren schlagen an
  const roomDoors=[], reach=doorReach(E, L);
  E.openings.filter(o=>o.kind==='door').forEach(o=>{
    const s=globalThis.doorSwing ? globalThis.doorSwing(E.pts, E.walls, o) : null;
    if(!s) return;
    const env=sector(s.angel, o.w, s.dir0, s.dir0+s.sense*Math.min(s.max, Math.PI/2), 10);
    const leaf={z0:o.y||0, z1:(o.y||0)+o.h};
    roomDoors.push({poly:env, ...leaf, txt:'die Zimmertür'});
    const rc=reach.get(o.id);
    G.forEach(g=>{ if(bandsMeet(g,leaf) && TL.convexOverlap(g.foot||g.poly, env, 1))
      add_('bad',[g.it.id], `Zimmertür schlägt an ${nameOf(g.it)}${rc && rc.hitId===g.it.id ? ` – geht nur ${rc.deg}° auf (mind. 90°)` : ''}`, g.c); });
    // Über 90°: die Tür geht auf, schlägt aber weiter hinten an (Türstopper).
    if(rc && rc.hit && rc.deg>=90) add_('info',[rc.hitId], `Zimmertür geht ${rc.deg}° auf, dann stößt sie an ${rc.hit} – Türstopper vorsehen`, (L.byId.get(rc.hitId)||{}).c);
  });
  // 6. Fronten: Gerätetüren, Auszüge, Drehtüren gegen andere Teile
  G.forEach(g=>g.env.forEach(e=>{
    G.forEach(h=>{
      if(e.leaf || h.it.id===g.it.id || !bandsMeet(e,h)) return;
      // Nachbarn an derselben Wand teilen nur die Kante - kein Anschlag.
      // Tresen: was bis unter die Platte reicht, stößt an den Überstand.
      const hp = h.foot && e.z1 > h.z1-60 ? h.foot : h.poly;
      if(!TL.convexOverlap(e.poly, hp, 2)) return;
      // Innenecke: die Zeile an der Nachbarwand steht direkt vor einem Teil
      // der Front. Bleiben ≥ 300 mm frei, ist es ein Eckschrank (Blindecke),
      // sonst ist die Front zu.
      if((e.what==='Tür'||e.what==='Auszug') && h.Wf && g.Wf && h.Wf.key!==g.Wf.key){
        const {L:pl,R:pr}=frontLR(g), dir=unit(sub(pr,pl)), wF=len(sub(pr,pl));
        const strip=[pl, pr, add(pr,mul(g.n,60)), add(pl,mul(g.n,60))];
        const cut=TL.clipConvex(hp, strip);
        if(cut.length>=3){
          const pr_=cut.map(p=>dot(sub(p,pl),dir)), c0=Math.max(0,Math.min(...pr_)), c1=Math.min(wF,Math.max(...pr_)), b=c1-c0, free=wF-b;
          // Abhilfe: zum Eckschrank machen – an der Ecke stehen bleiben, zur
          // freien Seite wachsen. Nur anbieten, wenn das passt und etwas ändert.
          let toCorner=null;
          // Auch oben: Hänge-Eckschrank (Meldung M-20261109-134919-c2a193).
          if((g.it.kind==='base' && (!g.it.dev || g.it.dev==='sink') || g.it.kind==='wall' && !g.it.dev) && !g.free){
            const Cc=CORNER[g.it.kind], need=Math.ceil((b+Cc.minDoor)/50)*50, W=Math.max(g.it.w, g.it.kind==='wall'?782:1000, need), atS0=g.s0<=g.Wf.L-g.s1, x2=atS0 ? g.s0 : g.s1-W;
            const t1={...g.it, w:W, corner:true, front:'door', a:g.Wf.a, b:g.Wf.b, x:x2}; delete t1.door;
            const same = g.it.corner && frontKind(g.it)==='door' && g.it.w>=W && g.it.door==null;
            const nmC = g.it.kind==='wall' ? 'Eckhängeschrank' : 'Eckschrank';
            if(!same && fitsAt(E,K,L,t1,g.Wf,x2)) toCorner={label: g.it.corner?`${nmC} breiter`:`Als ${nmC}`, id:g.it.id, set:{corner:true, front:'door', w:W, a:g.Wf.a, b:g.Wf.b, x:Math.round(x2*10)/10}, del:['door']};
          }
          // Eckschrank: Blende deckt den verdeckten Teil? Dann ist alles richtig.
          const cb=cornerBlind(g,S);
          if(cb && e.what==='Tür' && b<=cb.b+10) return;
          if(e.what==='Auszug'){
            add_('bad',[g.it.id,h.it.id], `${labelOf(h.it)} verdeckt ${mm(b)} mm der Auszüge von ${labelOf(g.it)} – Schubladen gehen nicht auf. Eckschrank planen oder Zeile versetzen`, centroid(cut), toCorner); return;
          }
          // Drehtür: ein Halbeckschrank – Blende hinter der Querzeile, Tür auf
          // dem freien Teil. Geht, solange ≥ 300 mm frei bleiben.
          if(free>=300){ add_('warn',[g.it.id,h.it.id], `Ecke: ${labelOf(h.it)} verdeckt ${mm(b)} mm von ${labelOf(g.it)} – als Eckschrank (Blende + Tür) planen`, centroid(cut), cb?null:toCorner); return; }
          add_('bad',[g.it.id,h.it.id], `${labelOf(h.it)} verdeckt die Tür von ${labelOf(g.it)} (nur ${mm(Math.max(0,free))} mm frei) – Eckschrank breiter planen oder Zeile versetzen`, centroid(cut), toCorner); return;
        }
      }
      add_('bad',[g.it.id,h.it.id], `${e.what} von ${nameOf(g.it)} stößt an ${nameOf(h.it)}`, centroid(e.poly));
    });
    // Ecken: zwei Fronten über Eck, beide gleichzeitig offen (z. B. Spülmaschine einräumen, Auszug daneben)
    G.forEach(h=>{
      if(h.it.id<=g.it.id || (h.Wf && g.Wf && h.Wf.key===g.Wf.key)) return;
      const cn=dot(g.n,h.n);
      // Mit Passblende dazwischen gehen beide Fronten auf – nur nicht gleichzeitig.
      const spaced = Math.abs(cn)<0.7 && gapBetween(g,h)>=PASS-1;
      h.env.forEach(f=>{ if(bandsMeet(e,f) && TL.convexOverlap(e.poly, f.poly, 2))
        if(spaced) add_('info',[g.it.id,h.it.id], `Über Eck: ${e.what} von ${labelOf(g.it)} und ${f.what} von ${labelOf(h.it)} gehen nicht gleichzeitig auf`, centroid(e.poly));
        else add_('warn',[g.it.id,h.it.id], cn<-0.7 ? `Gegenüber: ${e.what} von ${nameOf(g.it)} und ${f.what} von ${nameOf(h.it)} treffen sich offen – Gang verbreitern oder Teile versetzen`
          : Math.abs(cn)<0.7 ? `Über Eck: ${e.what} von ${nameOf(g.it)} und ${f.what} von ${nameOf(h.it)} behindern sich (Passblende 50–100 mm einplanen)`
          : `${e.what} von ${nameOf(g.it)} und ${f.what} von ${nameOf(h.it)} behindern sich offen`, centroid(e.poly)); });
    });
    // Drehtür schwenkt aus dem Raum (Wand im Weg)
    if(e.what==='Tür' && !e.leaf && !polyInRoom(E, e.poly.map(p=>add(p, mul(sub(e.hinge,p),0.02)))))
      add_('warn',[g.it.id], `Tür von ${nameOf(g.it)} geht keine ${e.deg||90}° auf, die Wand ist im Weg (Anschlag tauschen oder Passblende${(e.deg||90)>90?', oder nur 90° einplanen':''})`, centroid(e.poly),
        (e.deg||90)>90 && polyInRoom(E, swing90(e.hinge, e.along, e.n, e.r).map(p=>add(p, mul(sub(e.hinge,p),0.02)))) ? {label:'Nur 90° einplanen', id:g.it.id, set:{swing:90}} : null);
  }));
  // Kühlschrank mit Angel an der Wand: Tür und Auszüge brauchen Luft.
  G.filter(g=>isCold(g.it) && !fzOf(g.it)).forEach(g=>{
    const hingeR = (g.it.hinge||'left')==='right', {L:pl, R:pr}=frontLR(g);
    // Luft neben der Angel: Strahl knapp vor der Frontebene (zählt nur, was
    // über die Front hinausragt – Wand, tieferer Nachbar, Querzeile).
    const gapAt=right=>{ const h=right?pr:pl, side=unit(sub(h, right?pl:pr)), o0=add(add(h, mul(g.n,10)), mul(side,-5));
      const t=TL.rayToRing(E.ring, o0, side); let gap=t?t.t-5:Infinity, wall=true;
      L.G.forEach(o=>{ if(o!==g && o.it.kind!=='wall'){ const r=rayPoly(o0, side, o.foot||o.poly); if(r!=null && r-5<gap){ gap=r-5; wall=false; } } });
      return {gap, wall, h}; };
    const cur=gapAt(hingeR), oth=gapAt(!hingeR);
    if(cur.gap<50) add_('warn',[g.it.id], `${DEV[g.it.dev].label}: Angel ${hingeR?'rechts':'links'} ${cur.wall?'an der Wand':'am Nachbarn'}, nur ${mm(Math.max(0,cur.gap))} mm Luft – Tür geht kaum über 90° auf, Auszüge klemmen. ${oth.gap>=50?'Anschlag tauschen oder ':''}50 mm Passblende`, cur.h,
      oth.gap>=50 ? {label:'Anschlag tauschen', id:g.it.id, set:{hinge: hingeR?'left':'right'}} : null);
  });
  // Flügeltüren frei stehender Kühlschränke: jeden Flügel in 2°-Schritten
  // aufschwenken, bis er an Wand, Nachbar, Arbeitsplatte, Zimmertür oder
  // Fensterflügel stößt. Unter 90° gehen die Schubladen nicht auf (bad),
  // unter dem vollen Winkel lassen sich Fächer nicht herausnehmen (warn).
  const winSashes=E.openings.flatMap(o=>sashes(E,o).map(sa=>({...sa, txt:'der Fensterflügel'})));
  G.filter(g=>fzOf(g.it)).forEach(g=>g.env.filter(e=>e.leaf).forEach(e=>{
    const r=leafReach(E, L, g, e, roomDoors, winSashes), lf=e.leaf, deg=Math.PI/180;
    if(r.angle>=lf.full) return;
    const at=centroid(leafRect(lf, Math.min(r.angle+2, lf.full)*deg));
    const need=mm(leafReachSide(lf, lf.full*deg));
    if(r.angle<90) add_('bad',[g.it.id], `${nameOf(g.it)}, ${e.name}: geht nur ${r.angle}° auf, ${r.hit} ist im Weg – Schubladen lassen sich nicht ausziehen. Bei ${mm(lf.t)} mm Türdicke braucht der Flügel seitlich ${mm(leafReachSide(lf,Math.PI/2))} mm Luft für 90°, ${need} mm ganz offen (${lf.full}°)`, at);
    else add_('warn',[g.it.id], `${nameOf(g.it)}, ${e.name}: geht ${r.angle}° auf, nicht ganz (${lf.full}°) – ${r.hit} ist im Weg. Fächer und Schubladen lassen sich dann nicht herausnehmen; ganz offen braucht der Flügel seitlich ${need} mm Luft`, at);
  }));
  // 7. Gänge vor den Zeilen
  G.filter(g=>g.it.kind!=='wall' && g.it.kind!=='table').forEach(g=>{
    const [p,q]=g.front, w=len(sub(q,p)); let min=Infinity, minAt=null;
    // Der Gang beginnt an der Plattenkante (counter frontage), nicht an der
    // Korpusfront: die Platte steht bei topD > baseD vor – eigene wie gegenüber.
    const own=topOf(L,g), ov=own ? Math.max(0, own.depth-g.d) : 0;
    for(const t of [0.15,0.5,0.85]){
      const s0=add(p, mul(sub(q,p),t)), s=add(s0, mul(g.n,ov)), probe=add(s0,mul(g.n,2));
      // Teil der Front, vor dem direkt ein anderes Teil steht (Blindecke):
      // dort ist kein Gang - das meldet die Eckprüfung.
      if(L.G.some(h=>h!==g && h.it.kind!=='wall' && inPolyTol(probe,h.foot||h.poly))) continue;
      // Der Gang: von der Plattenkante bis zur Kante gegenüber (Platte, Korpus,
      // Wand). Liegt die Plattenkante schon in einem anderen Teil samt Platte
      // (ein Strahl begänne darin): bei einer Querzeile ist das die Blindecke,
      // sonst (auch bei Insel und Tisch, die quer stehen können) stoßen die
      // Kanten aneinander – kein Gang, 0 mm.
      const cross=h=>!h.free && !g.free && Math.abs(dot(g.n,h.n))<0.7, pt=add(s,mul(g.n,2));
      const inn=L.G.filter(h=>h!==g && h.it.kind!=='wall' && frontage(L,h).some(P=>inPolyTol(pt,P)));
      if(inn.some(cross)) continue;
      let tc=0;
      if(!inn.length){
        const o1=add(s,mul(g.n,1)), info={}; tc=freeAhead(E,L,g,o1,g.it.id,info); let hit=info.hit;
        L.G.forEach(h=>{ const tp=h.it.id!==g.it.id && topOf(L,h); if(!tp) return;
          const r=rayPoly(o1,g.n,tp.poly); if(r!=null && r<tc){ tc=r; hit=h; } });
        // Knapp vor einer Querzeile (Passblende in der Innenecke): Blindecke, kein
        // Gang. Der Abstand zählt ab der Korpusfront (tc + ov), wie bisher.
        if(tc+ov<300 && hit && cross(hit)) continue;
        // Der Strahl beginnt 1 mm vor der Kante (o1): der Gang ist so viel länger. Ohne das stünde ein
        // Gang von genau 1200 mm als „1199“ im Plan (gelb), genau 900 mm als „899“ (rot).
        tc+=1;
      }
      if(tc<min){ min=tc; minAt=s; } }
    if(!(w>0) || !isFinite(min)) return;
    // Verglichen wird, was die Meldung zeigt (ganze mm): in gedrehten Räumen
    // liegt ein Strahl um 1e-9 neben dem Sollwert, „900 mm“ dürfte nicht rot sein.
    min=mm(min);
    { const rc=S.persons>=2?1219:1200;
      gap_('gang', [g.it.id], minAt, g.n, min, rc, min<900?'bad':min<rc?'warn':'ok',
        min<900 ? 'Gang unter 900 mm' : min<rc ? `Gang unter empfohlenen ${rc} mm${min<1067?' (NKBA mind. 1067)':''}` : ''); }
    // NKBA Guideline 6: Arbeitsgang 42″ (1067) für eine Person, 48″ (1219)
    // für mehrere Köche.
    if(min<900) add_('bad',[g.it.id], `Vor ${nameOf(g.it)} nur ${mm(min)} mm Platz (Gang mind. 900, empfohlen ${S.persons>=2?1219:1200})`, g.frontMid);
    else if(S.persons>=2 && min<1219) add_('warn',[g.it.id], `Gang vor ${nameOf(g.it)} ${mm(min)} mm – zu zweit kochen: NKBA mind. 1219 mm`, g.frontMid);
    else if(min<1200) add_('warn',[g.it.id], `Gang vor ${nameOf(g.it)} ${mm(min)} mm – empfohlen 1200 mm (NKBA mind. 1067)`, g.frontMid);
  });
  // 8. Tisch: Stühle zurückschieben (NKBA: 813 ohne, 1118 mit Durchgang)
  G.filter(g=>g.it.kind==='table').forEach(g=>{
    const sides=tableSides(g,E,L);
    if(!sides.some(s=>s.seats>0)) add_('warn',[g.it.id], `Tisch: an keiner Seite Platz für einen Stuhl (mind. ${SEAT_ROOM} mm)`, g.c);
    sides.filter(s=>s.seats>0).forEach(s=>{
      const narrow=seatClearance(E,L,g,s), t=mm(narrow.room);
      gap_('tisch', [g.it.id], narrow.at, s.n, t, 813, t<750?'bad':t<813?'warn':'ok', t<750?'Stuhl: unter 750 mm':t<813?'Stuhl: unter NKBA 813 mm':'');
      if(t<750) add_('bad',[g.it.id], `Tisch: hinter den Stühlen nur ${mm(t)} mm (mind. 750, NKBA 813)`, narrow.at);
      else if(t<813) add_('warn',[g.it.id], `Tisch: hinter den Stühlen ${mm(t)} mm – NKBA 813, zum Vorbeigehen 1118`, narrow.at);
    });
  });
  // Tresen: hinter den Hockern Platz (NKBA 813, zum Vorbeigehen 1118; Fehler
  // unter 750 wie am Tisch). Gemessen wird über die ganze Hockerkante: an den
  // Enden und an jeder Ecke eines Hindernisses (Teile samt Platten, Wandring),
  // dort liegt das Minimum.
  G.filter(g=>g.bar>0).forEach(g=>{
    const [a,b]=g.foot, ab=sub(b,a), l2=dot(ab,ab), dir=mul(g.n,-1);
    const obs=[]; L.G.forEach(h=>{ if(h!==g && h.it.kind!=='wall') frontage(L,h).forEach(P=>obs.push(P)); });
    // Ecken näher als 1 mm am Kantenende zählen nicht (die Endstellen liegen schon 1 mm innen):
    // ein bündig angrenzender Schrank steht nicht hinter dem letzten Platz, Rauschen entschiede sonst.
    const e1=1/Math.sqrt(l2), us=[e1, 1-e1], addU=v=>{ const u=dot(sub(v,a),ab)/l2; if(u>e1 && u<1-e1) us.push(u); };
    obs.forEach(P=>P.forEach(addU)); TL.ringsOf(E.ring).forEach(R=>R.forEach(addU));
    let t=Infinity, m=mul(add(a,b),0.5);
    us.forEach(u=>{ const pu=add(a,mul(ab,u)), o=add(pu, mul(dir,-2)); let tu=Infinity;
      const r=TL.rayToRing(E.ring, o, dir); if(r) tu=r.t-2;
      obs.forEach(P=>{ const x=rayPoly(o,dir,P); if(x!=null && x-2<tu) tu=x-2; });
      if(tu<t){ t=tu; m=pu; } });
    t=Math.max(0,mm(t));
    gap_('tresen', [g.it.id], m, dir, t, 813, t<750?'bad':t<813?'warn':'ok', t<750?'Hocker: unter 750 mm':t<813?'Hocker: unter NKBA 813 mm':'');
    if(t<750) add_('bad',[g.it.id], `Tresen: hinter den Hockern nur ${mm(t)} mm (mind. 750, NKBA 813)`, m);
    else if(t<813) add_('warn',[g.it.id], `Tresen: hinter den Hockern ${mm(t)} mm – NKBA 813, zum Vorbeigehen 1118`, m);
  });
  // Dunstabzug ohne Kochfeld darunter
  G.filter(g=>g.it.dev==='hood' && !g.free).forEach(g=>{
    if(!G.some(h=>h.it.dev==='hob' && !h.free && h.Wf.key===g.Wf.key && g.s0<h.s1-1 && h.s0<g.s1-1))
      add_('info',[g.it.id], `Dunstabzug ohne Kochfeld darunter`, g.c);
  });
  // Hängeschränke über der Arbeitsplatte: Kopffreiheit (Konsument: ≥ 500 mm).
  G.filter(g=>g.it.kind==='wall' && !g.free && g.it.dev!=='hood').forEach(g=>{
    const over=L.tops.some(t=>t.Wf && t.Wf.key===g.Wf.key && g.s0<t.s1-1 && t.s0<g.s1-1);
    if(!over) return;
    const gap=g.z0-D.workH;
    if(gap<450) add_('bad',[g.it.id], `${labelOf(g.it)} nur ${mm(gap)} mm über der Arbeitsplatte – man stößt mit dem Kopf an (mind. 500)`, g.c);
    else if(gap<500) add_('warn',[g.it.id], `${labelOf(g.it)} ${mm(gap)} mm über der Arbeitsplatte – empfohlen 500–650`, g.c);
  });
  // Passleisten: Lücken zwischen Schränken und Restmaße zur Wand bis 150 mm.
  (L.fillers||[]).forEach(f=>add_('info', f.between||[], `${f.corner?'Passblende Ecke':'Passleiste'} ${mm(f.w)} mm${f.between?' zwischen zwei Schränken':''}`, wpt(f.Wf,(f.s0+f.s1)/2,300)));
  // Schlauchlängen zum Wasseranschluss (Meldung M-20261109-150408-6c7165)
  hoseCheck(E, K, L).forEach(f=>add_(f.lvl, f.ids, f.txt, f.at));
  // 9. Ergonomie (NKBA, Blum, Neff) – nur, wenn die Geräte da sind. Von einer
  // Art kann es mehrere geben (zwei Spülen, zwei Kochfelder): Regeln am Gerät
  // (Fenster, Abstellfläche, Hängeschrank darüber, Kühlschrank) gelten für
  // jedes; Regeln zwischen Geräten (Spülmaschine – Spüle, Spüle – Kochfeld,
  // Arbeitsdreieck) sind erfüllt, wenn irgendeine Kombination sie erfüllt.
  const dev=k=>G.filter(g=>g.it.dev===k && !g.wing);
  const snk=dev('sink'), hbs=dev('hob'), dws=dev('dw'), frs=dev('fridge');
  if(dws.length && snk.length){
    // NKBA Guideline 13: das Hauptgerät steht höchstens 914 mm von einer Spüle.
    let best=null; dws.forEach(a=>snk.forEach(s=>{ const d=gapBetween(a,s); if(!best || d<best.d) best={d, dw:a, sink:s}; }));
    if(best.d>914) add_('warn',[best.dw.it.id,best.sink.it.id], `Spülmaschine ${mm(best.d)} mm von der Spüle – höchstens 914 mm (NKBA), am besten direkt daneben`, best.dw.frontMid);
  }
  hbs.forEach(hob=>{
    E.openings.filter(o=>o.kind==='window' && !(o.swing && o.swing.type==='fix')).forEach(o=>{ if(!hob.free){ const on=openingOn(E,o,hob.Wf); if(on && hob.s0<on.s1 && on.s0<hob.s1)
      add_('bad',[hob.it.id], `Kochfeld unter einem Fenster (NKBA: nicht unter einem Fenster, das sich öffnen lässt)`, hob.c); } });
    if(!hob.free){
      const side=s=>landing(L,hob,s);
      const l=side(-1), r=side(1);
      // Die Vorgabe (Spec) ist je Seite 300; NKBA Guideline 17 nennt 305 und 381.
      if(Math.min(l,r)<300) add_('warn',[hob.it.id], `Neben dem Kochfeld ${mm(Math.min(l,r))} mm Abstellfläche – je Seite mind. 300 mm (NKBA: 305 mm auf einer, 381 mm auf der anderen Seite)`, hob.frontMid);
    }
    // Über dem Kochfeld: Dunstabzug statt Hängeschrank. Abstand nach Neff:
    // Flachschirm (Elektro) ab 430, Wandhaube 550, Gas 650 mm.
    G.filter(g=>g.it.kind==='wall' && !g.free && !hob.free && g.Wf.key===hob.Wf.key && g.s0<hob.s1-1 && hob.s0<g.s1-1).forEach(g=>{
      const gap=g.z0-D.workH, off=Math.abs((g.s0+g.s1)/2-(hob.s0+hob.s1)/2), wide=(g.s1-g.s0)>=(hob.s1-hob.s0)-1;
      if(g.it.dev==='hood'){
        if(gap<430) add_('bad',[g.it.id,hob.it.id], `Dunstabzug nur ${mm(gap)} mm über dem Kochfeld – Elektro mind. 430 (Flachschirm), Gas 650 mm`, g.c);
        if(off>50) add_('warn',[g.it.id,hob.it.id], `Dunstabzug ${mm(off)} mm neben der Kochfeldmitte – mittig ausrichten`, g.c);
        if(!wide) add_('warn',[g.it.id,hob.it.id], `Dunstabzug schmaler als das Kochfeld`, g.c);
      }
      else add_('warn',[g.it.id,hob.it.id], `${labelOf(g.it)} hängt über dem Kochfeld – dort gehört der Dunstabzug hin${off<=50&&wide?'':' (mittig darüber)'}`, g.c,
        off<=50 && wide ? {label:'Als Dunstabzug', id:g.it.id, set:{dev:'hood', front:'open'}, del:['store']} : null);
    });
  });
  if(snk.length && hbs.length){
    // Arbeitsfläche = durchgehende Platte zwischen beiden (auch über Eck). Teile
    // auf der Insel und nicht benachbarte Wände lassen sich nicht messen und
    // zählen nicht: gewertet wird das beste messbare Paar (gibt es keins, kein Befund).
    let best=null;
    snk.forEach(s=>hbs.forEach(h=>{ const m=prepBetween(L,s,h); if(m!=null && (!best || m>best.m)) best={m, s, h}; }));
    if(best && mm(best.m)<900) add_('warn',[best.s.it.id,best.h.it.id], `Zwischen Spüle und Kochfeld ${mm(best.m)} mm Arbeitsfläche – Blum/NKBA: mind. 900 mm`, centroid([best.s.c,best.h.c]));
  }
  frs.forEach(fridge=>{
    // Griffseite gegenüber der Angel, in Wandrichtung ausgedrückt
    const {L:pl,R:pr}=frontLR(fridge), grip=fridge.it.hinge==='right'?pl:pr;
    const hs=fridge.free ? 1 : (dot(sub(grip,fridge.frontMid),fridge.u)>0 ? 1 : -1);
    // Zwei Flügel: Griffe auf beiden Seiten. NKBA erlaubt beim Side-by-Side
    // die Abstellfläche „on either side“; für French Door gilt dasselbe.
    const l=fzOf(fridge.it) ? Math.max(landing(L,fridge,-1), landing(L,fridge,1)) : landing(L,fridge,hs);
    if(l<380 && !fridge.free) add_('warn',[fridge.it.id], fzOf(fridge.it) ? `${nameOf(fridge.it)}: auf keiner Seite Abstellfläche (mind. 380 mm, NKBA)` : `Kühlschrank: neben dem Griff keine Abstellfläche (mind. 380 mm, NKBA)`, fridge.frontMid);
  });
  if(snk.length && hbs.length && frs.length){
    // NKBA Guideline 3 nennt metrisch selbst 7,9 m und je Schenkel 1,2 bis 2,7 m.
    // Gibt es mehrere Geräte, zählt die Kombination mit den wenigsten Verstößen.
    // Verglichen wird, was die Meldung zeigt (10 mm): sonst stünde „2,70 m (zu lang)“
    // neben der Grenze 2,7, und in gedrehten Räumen liegt ein Schenkel um 1e-11 über dem Sollwert.
    // Genau halbe 10 mm (2705) runden nach unten, auch bei 2705,00000000001.
    const st=g=>g.frontMid, cm=x=>Math.round((x-0.01)/10)*10, mf=x=>(cm(x)/1000).toFixed(2).replace('.',','), lo=x=>cm(x)<1200, hi=x=>cm(x)>2700; let best=null;
    snk.forEach(s=>hbs.forEach(h=>frs.forEach(f=>{
      const a=len(sub(st(s),st(h))), b=len(sub(st(h),st(f))), c=len(sub(st(f),st(s))), sum=a+b+c, n=[a,b,c].filter(x=>lo(x)||hi(x)).length+(cm(sum)>7900?1:0);
      if(!best || n<best.n || (n===best.n && sum<best.sum-0.5)) best={s,h,f,a,b,c,sum,n}; })));
    // Schenkel mit zwei Nachkommastellen und dem Verstoß benannt: „2,72“ neben der Grenze 2,7 war nicht zu deuten.
    const leg=(nm,x)=>`${nm} ${mf(x)} m${lo(x)?' (zu kurz)':hi(x)?' (zu lang)':''}`;
    if(rec){ const P=[[st(best.s),st(best.h),best.a],[st(best.h),st(best.f),best.b],[st(best.f),st(best.s),best.c]];
      P.forEach(([u,v,x])=>{ const bad=lo(x)||hi(x); rec.push({k:'dreieck', ids:[best.s.it.id,best.h.it.id,best.f.it.id], a:u, b:v, val:Math.round(x), lim:'1,2–2,7 m', lvl:bad?'warn':'ok', why:lo(x)?'Schenkel unter 1,2 m':hi(x)?'Schenkel über 2,7 m':''}); });
      rec.push({k:'summe', ids:[], a:centroid([st(best.s),st(best.h),st(best.f)]), val:Math.round(best.sum), lim:'7,9 m', lvl:cm(best.sum)>7900?'warn':'ok', why:cm(best.sum)>7900?'Summe über 7,9 m':''}); }
    if(best.n) add_('warn',[best.s.it.id,best.h.it.id,best.f.it.id], `Arbeitsdreieck ${mf(best.sum)} m${cm(best.sum)>7900?' (zu lang)':''} – Schenkel ${leg('Spüle–Kochfeld',best.a)}, ${leg('Kochfeld–Kühlschrank',best.b)}, ${leg('Kühlschrank–Spüle',best.c)} – NKBA: Summe ≤ 7,9 m, je Schenkel 1,2–2,7 m`, centroid([st(best.s),st(best.h),st(best.f)]));
  }
  // Doppelte Meldungen (über Eck) zusammenfassen
  const byKey=new Map();
  out.forEach(f=>{ const k=f.lvl+'|'+f.txt, h=byKey.get(k);
    if(!h) byKey.set(k,{...f, ids:[...f.ids]}); else f.ids.forEach(id=>{ if(!h.ids.includes(id)) h.ids.push(id); }); });
  return [...byKey.values()].sort((p,q)=>LEVEL_ORDER[p.lvl]-LEVEL_ORDER[q.lvl]);
}
// Freie Arbeitsplatte neben g zur Seite sg (-1 links von s0, +1 rechts von s1).
// ---------- Wasseranschluss und Schlauchlängen ----------
// Meldung M-20261109-150408-6c7165. Der Anschluss (Eckventil + Abfluss) ist
// ein Punkt an der Wand, gesetzt im Wände-Tab (E.water). Der Schlauch läuft
// hinter den Schränken an der Wand entlang, um Innenecken herum, und
// senkrecht vom Geräteanschluss zum Wandanschluss. Grenzen:
//  Spülmaschine Zulauf mit AquaStop 1680 mm (Bosch-Ersatzteil 00668113,
//  „1,68 m“), Ablauf 1900 mm (Bosch 00666148, „1,9 m“), Verlängerung
//  2200 mm (Bosch 00671612, „220 cm“). Es bindet der kürzere Zulauf.
//  Kühlschrank mit Festwasser: Einbau 1150 mm (Liebherr-Montageanleitung,
//  600er Gerät: „Maximal verfügbare Schlauchlänge ~1150 mm“), frei
//  stehend 5000 mm (Beko: 1 m + 4 m mit Filter dazwischen) – beides je
//  Modell verschieden, daher als Richtwert (gelb).
//  Hoch eingebaute Spülmaschine: liegt der Abfluss tiefer als die offene
//  Tür, muss der Ablauf belüftet werden (Miele-Montageplan M.-Nr. 11 728 450).
const HOSE={ dwIn:1680, dwOut:1900, dwExt:2200, fridgeBuilt:1150, fridgeFree:5000 };
function waterPts(E){
  return (E.water||[]).map(w=>{ const A=P(E,w.a), B=P(E,w.b); if(!A||!B) return null;
    const u=unit(sub(B,A)); return {w, p:{x:A.x+u.x*w.x, y:A.y+u.y*w.x}, z:w.y}; }).filter(Boolean);
}
// Weg an der Wand entlang zwischen zwei Wandpunkten: auf demselben Ring
// der kürzere Bogen, sonst (Insel, Pfeiler) die Luftlinie.
function alongWall(E, p, q){
  const pos=pt=>{ let best=null;
    TL.ringsOf(E.ring).forEach((R,ri)=>{ let acc=0;
      R.forEach((a,i)=>{ const b=R[(i+1)%R.length], e=sub(b,a), l=len(e)||1, t=clamp(dot(sub(pt,a),e)/(l*l),0,1);
        const d=len(sub(pt,add(a,mul(e,t))));
        if(!best || d<best.d) best={ri, s:acc+t*l, d};
        acc+=l; });
      if(best && best.ri===ri) best.P=acc; });
    return best; };
  const a=pos(p), b=pos(q);
  if(!a || !b || a.ri!==b.ri || a.d>800 || b.d>800) return len(sub(p,q));
  const ds=Math.abs(a.s-b.s);
  return Math.min(ds, a.P-ds) + a.d + b.d;
}
function hoseCheck(E, K, L){
  const S=K.spec, out=[], W=waterPts(E);
  const needs=L.G.filter(g=>!g.wing && (g.it.dev==='dw' || (g.it.dev==='fridge' && g.it.water)));
  if(!needs.length) return out;
  if(!W.length){
    out.push({lvl:'info', ids:needs.map(g=>g.it.id), txt:`Kein Wasseranschluss gesetzt – im Raumaufmaß unter Wände „Anschluss“, dann prüft die Küche die Schlauchlängen`, at:needs[0].c});
    return out;
  }
  needs.forEach(g=>{
    const it=g.it, dw=it.dev==='dw';
    // Anschluss am Gerät: hinten unten an der Wand (Spülmaschine hoch: an
    // ihrer Unterkante), bei frei stehenden Teilen in der Mitte.
    const p = g.free ? g.c : wpt(g.Wf,(g.s0+g.s1)/2,0);
    const z = dw ? (devZ(it,S)!=null ? devZ(it,S) : S.plinth) : 100;
    let best=null;
    W.forEach(x=>{ const l=(g.free ? len(sub(p,x.p)) : alongWall(E,p,x.p)) + Math.abs(x.z-z); if(!best || l<best.l) best={l, x}; });
    const l=Math.round(best.l), at=mul(add(p,best.x.p),0.5);
    if(dw){
      if(l>HOSE.dwIn+HOSE.dwExt) out.push({lvl:'bad', ids:[it.id], txt:`${nameOf(it)} ${mm(l)} mm Schlauchweg zum Wasseranschluss – auch mit Verlängerung (2,2 m) zu weit; Anschluss näher setzen`, at});
      else if(l>HOSE.dwIn) out.push({lvl:'warn', ids:[it.id], txt:`${nameOf(it)} ${mm(l)} mm Schlauchweg zum Wasseranschluss – Zulauf 1,68 m / Ablauf 1,9 m reichen nicht, Verlängerung nötig`, at});
      if(it.kind==='tall' && best.x.z<z) out.push({lvl:'info', ids:[it.id], txt:`${nameOf(it)}: Abfluss liegt tiefer als das Gerät – Wasserablauf belüften (Miele-Montageplan)`, at});
    } else {
      const lim=fzOf(it) ? HOSE.fridgeFree : HOSE.fridgeBuilt;
      if(l>lim) out.push({lvl:'warn', ids:[it.id], txt:`${nameOf(it)} Festwasser: ${mm(l)} mm Schlauchweg – üblich bis ${mm(lim)} mm (${fzOf(it)?'frei stehend':'Einbau'}, je Modell verschieden)`, at});
    }
  });
  return out;
}
function landing(L, g, sg){
  // Eigene Platte, sonst (Hochschrank) die direkt anstoßende derselben Wand.
  let top=L.tops.find(t=>t.ids.includes(g.it.id));
  if(!top && g.Wf) top=L.tops.find(t=>!t.island && t.Wf && t.Wf.key===g.Wf.key && (sg<0 ? Math.abs(t.s1-g.s0)<=10 : Math.abs(t.s0-g.s1)<=10));
  if(!top || !top.Wf) return 0;
  let s = sg<0 ? top.s0 : top.s1, edge = sg<0 ? g.s0 : g.s1;
  // Geräte auf derselben Platte beschneiden die Abstellfläche.
  // Nur Spüle und Kochfeld belegen Plattenfläche (Spülmaschine liegt darunter).
  L.G.forEach(h=>{ if(h===g || !h.Wf || h.Wf.key!==g.Wf.key || !(h.it.dev==='sink'||h.it.dev==='hob') || h.it.kind!=='base') return;
    if(sg<0 && h.s1<=g.s0+1 && h.s1>s) s=h.s1; if(sg>0 && h.s0>=g.s1-1 && h.s0<s) s=h.s0; });
  let free=Math.max(0, sg<0 ? edge-s : s-edge);
  // Innenecke: endet die freie Strecke am Plattenende und stößt dort die
  // Platte der Nachbarwand an, zählt deren Stück im eigenen Tiefenstreifen mit.
  if(Math.abs(s-(sg<0?top.s0:top.s1))<1){
    const Wf=top.Wf, strip=[wpt(Wf,-1e5,0),wpt(Wf,1e5,0),wpt(Wf,1e5,top.depth),wpt(Wf,-1e5,top.depth)];
    L.tops.forEach(t=>{ if(t===top || t.island || !t.Wf || t.Wf.key===Wf.key) return;
      const cut=TL.clipConvex(t.poly, strip); if(cut.length<3) return;
      const pr=cut.map(p=>dot(sub(p,Wf.A),Wf.u)), p0=Math.min(...pr), p1=Math.max(...pr);
      if(sg<0 ? Math.abs(p1-s)<=PASS+20 : Math.abs(p0-s)<=PASS+20){
        // Spüle/Kochfeld auf der Querplatte direkt in der Ecke kürzen nicht weiter – grob genug für die Prüfung.
        free+=p1-p0; } });
  }
  return free;
}
function gapBetween(a,b){
  if(a.Wf && b.Wf && a.Wf.key===b.Wf.key) return Math.max(0, Math.max(a.s0,b.s0)-Math.min(a.s1,b.s1));
  if(TL.convexOverlap(a.poly,b.poly,0)) return 0;
  const ps=(p,u,v)=>{ const d=sub(v,u), t=clamp(dot(sub(p,u),d)/(dot(d,d)||1),0,1); return len(sub(p,add(u,mul(d,t)))); };
  let best=Infinity;
  [[a.poly,b.poly],[b.poly,a.poly]].forEach(([A,B])=>A.forEach(p=>B.forEach((u,i)=>{ best=Math.min(best, ps(p,u,B[(i+1)%B.length])); })));
  return best;
}
// Armatur: Mitte der Spüle, 90 mm vor der Wand (hinter dem Becken).
function faucetPoint(K, g){
  if(g.free) return add(g.c, mul(g.n, -g.d/2+90));
  return wpt(g.Wf, (g.s0+g.s1)/2, 90);
}
// Drehung freier Teile (Insel, Tisch) einrasten (Meldung
// M-20261109-134710-38fb04): auf 0/45/90/…° im Raumrahmen und parallel bzw.
// senkrecht zu jeder Wand (schiefe Wände). Winkel in Grad wie it.rot.
function rotSnaps(E){
  const out=[];
  const put=(a,how)=>{ for(let k=0;k<4;k++){ const r=((a+90*k)%360+360)%360; if(!out.some(o=>Math.abs(o.rot-r)<0.05)) out.push({rot:r, how}); } };
  if(E && E.F) E.wallsByKey.forEach(W=>{ const A=P(E,W.a), B=P(E,W.b); if(!A||!B) return;
    const d=sub(B,A), a=Math.atan2(dot(d,E.F.v), dot(d,E.F.u))*180/Math.PI;
    // Nur echt schiefe Wände: bis 3° ist es Messrauschen eines rechtwinkligen
    // Raums (sonst rastet man bei 178° statt 180° ein), kurze Vorsprünge zählen nicht.
    const m=((a%90)+90)%90; if(m>3 && m<87 && W.L>=500) put(m, 'an einer Wand'); });
  put(0, 'rechtwinklig'); put(45, '45°');
  return out;
}
function snapRot(E, deg, tol=4){
  const v=((deg%360)+360)%360;
  let best=null;
  rotSnaps(E).forEach(o=>{ let d=Math.abs(o.rot-v); d=Math.min(d,360-d); if(d<=tol && (!best || d<best.d)) best={...o, d}; });
  return best ? {rot:best.rot, how:best.how} : {rot:v, how:null};
}
// Tischplätze ergeben sich aus den Maßen (Meldung M-20261109-134530-c6a5ba):
// 60 cm Gedeckbreite × 40 cm Tiefe je Platz – gängiger Planungswert
// (Möbelhandel, Ratgeber; eine Norm mit dieser Zahl war nicht zu finden,
// NKBA nennt 24" = 61 cm). Stirnseite: ein Platz, wenn sie mind. 60 cm
// breit ist und die Längsseiten an jeder Ecke 20 cm Knieraum frei lassen
// (160×90 ergibt so 6 Plätze, wie im Handel üblich). Kostet der Stirnplatz
// einen Längsplatz, gewinnt die Variante mit mehr Plätzen, bei Gleichstand
// die ohne Stirnplatz. An einer Seite ohne Stuhlraum (Wand, Schrank näher
// als SEAT_ROOM) sitzt niemand. Lang ist immer die längere Seite, gleich in
// welches Feld sie eingetragen ist: 90 × 160 gibt dieselben Plätze wie 160 × 90.
const SEAT_W=600, SEAT_CORNER=200, SEAT_ROOM=450;
function seatPlan(w, d, open){
  if(w<d) [w,d]=[d,w];                                // w = Langseite
  const op=open||[true,true,true,true];             // lang, lang, kurz, kurz
  const nl=(op[0]?1:0)+(op[1]?1:0), ne=(op[2]?1:0)+(op[3]?1:0);
  const plain={long:Math.floor(w/SEAT_W), end:0};
  const withEnd={long:Math.max(0, Math.floor((w-2*SEAT_CORNER)/SEAT_W)), end:d>=SEAT_W?1:0};
  const tot=p=>p.long*nl+p.end*ne;
  return tot(withEnd)>tot(plain) ? withEnd : plain;
}
// Freier Raum hinter einer Tischseite (mm), wie ihn ein Stuhl braucht:
// 2 mm innen starten, damit ein bündig an der Wand stehender Tisch 0 gibt.
function seatRoom(E, L, g, s){
  let t=Infinity; const o=add(s.mid, mul(s.n,-2));
  const r=TL.rayToRing(E.ring, o, s.n); if(r) t=r.t-2;
  L.G.forEach(h=>{ if(h!==g && h.it.id!==g.it.id && h.it.kind!=='wall'){ const x=rayPoly(o,s.n,h.foot||h.poly); if(x!=null && x-2<t) t=x-2; } });
  return Math.max(0,t);
}
// Prüfung über die Tischkante: auch Hindernisse neben dem Mittelstrahl erfassen.
// Die Platzanzahl verwendet weiterhin seatRoom in der Mitte; ein Hindernis an
// einem Ende soll nicht pauschal alle Plätze dieser Seite entfernen.
function seatClearance(E,L,g,s){
  const ab=sub(s.b,s.a), l2=dot(ab,ab);
  if(l2<4) return {room:seatRoom(E,L,g,s),at:s.mid};
  const edge=1/Math.sqrt(l2), us=[edge,0.5,1-edge];
  const addU=v=>{ const u=dot(sub(v,s.a),ab)/l2; if(u>edge && u<1-edge) us.push(u); };
  TL.ringsOf(E.ring).forEach(R=>R.forEach(addU));
  L.G.forEach(h=>{ if(h!==g && h.it.id!==g.it.id && h.it.kind!=='wall') (h.foot||h.poly).forEach(addU); });
  let best={room:Infinity,at:s.mid};
  us.forEach(u=>{ const at=add(s.a,mul(ab,u)), room=seatRoom(E,L,g,{mid:at,n:s.n});
    if(room<best.room) best={room,at}; });
  return best;
}
// Tischseiten: Mitte, Außennormale, Plätze. Mit E, L zählen nur Seiten mit
// Stuhlraum; room ist dann der freie Raum dahinter.
function tableSides(g, E, L){
  const out=[], P=g.poly;
  const sideOf=([i,j],end)=>{ const a=P[i], b=P[j], m=mul(add(a,b),0.5); return {mid:m, n:unit(sub(m,g.c)), a, b, len:len(sub(b,a)), end}; };
  // Die Langseiten sind die längeren Kanten: bei Breite > Länge (900 × 1600) die
  // Kanten 1–2 und 3–0, nicht 0–1 und 2–3. Bei Gleichstand zählt die Länge.
  // Langseiten zuerst: so passt die Reihenfolge zu seatPlan (lang, lang, kurz, kurz).
  const wLang=g.it.w>=g.d;
  (wLang ? [[0,1],[2,3]] : [[1,2],[3,0]]).forEach(e=>out.push(sideOf(e,false)));
  (wLang ? [[1,2],[3,0]] : [[0,1],[2,3]]).forEach(e=>out.push(sideOf(e,true)));
  if(E && L) out.forEach(s=>{ s.room=seatRoom(E,L,g,s); });
  const plan=seatPlan(g.it.w, g.d, out.map(s=>s.room==null || s.room>=SEAT_ROOM));
  out.forEach(s=>{ s.open = s.room==null || s.room>=SEAT_ROOM; s.seats = s.open ? (s.end?plan.end:plan.long) : 0; });
  return out;
}
const tableSeats=(g,E,L)=>tableSides(g,E,L).reduce((n,s)=>n+s.seats,0);

// ---------- Platzieren an der Wand ----------
// Kandidaten für x (linke Kante ab Ecke a) auf Wand Wf für ein Teil der
// Breite w und Tiefe d: Wandenden (an schiefen Ecken so weit, dass die
// Front frei ist), Kanten der Nachbarn derselben Höhenlage auf derselben
// Wand, und die Vorderkante der Zeile an der Nachbarwand (Innenecke).
function slotCandidates(E, K, L, it, Wf){
  const {d,z0,z1}=dims(K,it), w=it.w, c=[];
  const lo=cornerStop(E, Wf, d, 0), hi=Wf.L-cornerStop(E, Wf, d, 1);
  c.push(lo, hi-w);
  // Eckschrank: Blende hinter der Querzeile, Tür davor (an beiden Enden).
  if(it.corner) [0,1].forEach(e=>{ const x=cornerPlace(E,K,L,{...it, cEnd:e},Wf); if(x!=null) c.push(x); });
  const strip=[wpt(Wf,-1e5,0),wpt(Wf,1e5,0),wpt(Wf,1e5,d),wpt(Wf,-1e5,d)];
  L.G.forEach(g=>{
    if(g.it.id===it.id) return;
    const same = !g.free && g.Wf.key===Wf.key;
    // Hängeschrank: auch über den Unter- und Hochschränken derselben Wand
    // ausrichten (bündig darüber), obwohl sie in einem anderen Höhenband liegen.
    if(same && it.kind==='wall' && g.it.kind!=='wall'){ c.push(g.s0, g.s1-w, g.s1, g.s0-w); return; }
    if(!(g.z0<z1-1 && z0<g.z1-1)) return;
    // Projektion des Nachbarn auf diese Wand, soweit er im Streifen 0..d liegt
    const cut=TL.clipConvex(g.foot||g.poly, strip);        // Tresen: samt Überstand
    if(cut.length<3) return;
    const pr=cut.map(p=>dot(sub(p,Wf.A),Wf.u)), s0=Math.min(...pr), s1=Math.max(...pr);
    // Teil an einer etwa rechtwinkligen Nachbarwand (Innenecke): mit
    // Passblende, damit Griffe und Fronten frei aufgehen.
    const quer = !g.free && !same && Math.abs(dot(g.n,Wf.n))<0.7;
    if(quer) c.push(s1+PASS, s0-w-PASS); else c.push(s1, s0-w);
  });
  // Öffnungen: neben Tür und Fenster anschließen (wo fitsAt sie sperrt,
  // auch Brüstung unter der Platte), Spüle mittig unters Fenster.
  const D=L.D||derived(K.spec), probe={it, z0, z1};
  E.openings.forEach(o=>{
    const on=openingOn(E,o,Wf); if(!on) return;
    if(openingOwnHit(D, {...probe, s0:on.s0, s1:on.s1}, on)) c.push(on.s1, on.s0-w);
    if(o.kind==='window' && (it.kind==='base')) c.push((on.s0+on.s1)/2-w/2);
  });
  // Zonen vor Öffnungen der Nachbarwände: dahinter anschließen.
  E.openings.forEach(o=>{
    const z=openingZone(E,o); if(!z || z.Wf.key===Wf.key || !zoneMeets(probe,z)) return;
    const cut=TL.clipConvex(z.rq, strip); if(cut.length<3) return;
    const pr=cut.map(p=>dot(sub(p,Wf.A),Wf.u));
    c.push(Math.max(...pr), Math.min(...pr)-w);
  });
  return c.filter(x=>isFinite(x) && x>=-1 && x+w<=Wf.L+1).map(x=>clamp(x,0,Math.max(0,Wf.L-w)));
}
// Wie weit muss ein Korpus der Tiefe d an diesem Wandende von der Ecke weg,
// damit seine Vorderkante nicht in die Nachbarwand läuft? Bei 90° und
// stumpfen Ecken 0, bei spitzen d·cot(θ).
function cornerStop(E, Wf, d, end){
  const R=TL.ringsOf(E.ring).find(R=>R.some(p=>p.id===Wf.a)&&R.some(p=>p.id===Wf.b));
  if(!R) return 0;
  const id = end===0 ? Wf.a : Wf.b, i=R.findIndex(p=>p.id===id);
  const nb=[R[(i+R.length-1)%R.length], R[(i+1)%R.length]].find(p=>p.id!==(end===0?Wf.b:Wf.a));
  if(!nb) return 0;
  const c=R[i], v=unit(sub(nb,c));                  // Nachbarwand von der Ecke weg
  const dirIn = end===0 ? Wf.u : mul(Wf.u,-1);       // diese Wand von der Ecke weg
  // Front q=d trifft die Nachbarwand bei s mit c + v*t = c + dirIn*s + n*d
  const den=crs(dirIn, v);
  if(Math.abs(den)<1e-9) return 0;
  const t=crs(dirIn, mul(Wf.n,d))/den, s=dot(sub(mul(v,t), mul(Wf.n,d)), dirIn);
  return (t>0 && s>0) ? s : 0;
}
// Passt das Teil bei x? Die harten Regeln von check(): im Raum, keine
// Überlappung (Tresen samt Überstand), Öffnungen an der eigenen Wand
// (auch Brüstung unter der Platte), Zonen vor Öffnungen der Nachbarwände.
// Decke, Fensterflügel, Zimmertür und Fronten prüft nur check.
// Hochschrank mit Gerät, der zu niedrig ist (check: rot, Abhilfe höher):
// mit der Höhe prüfen, die er braucht – sonst landet er unter einem Fenster,
// das er so hoch, wie er gebaut werden muss, verdeckt.
function fitsAt(E, K, L, it, Wf, x){
  if(!(x>=-1 && x+it.w<=Wf.L+1)) return false;          // nicht über das Wandende
  const t={...it, a:Wf.a, b:Wf.b, x}, g0=geom(E,K,t);
  if(!g0) return false;
  const sg=devSegs(t,K.spec), g = sg && sg.need>g0.z1 ? {...g0, z1:sg.need} : g0;
  // Eckschrank über Eck / diagonal: auch der zweite Schenkel muss frei sein.
  const parts=[g];
  if(shapeOf(t)){ const wg=cornerWing(E,K,g); if(wg){ cornerShape(g,wg); parts.push(wg); } }
  const D=L.D||derived(K.spec), zones=E.openings.map(o=>openingZone(E,o)).filter(Boolean);
  return parts.every(p=>polyInRoom(E, p.foot||p.poly)
    && !L.G.some(h=>h.it.id!==it.id && partsClash(p,h))
    && !E.openings.some(o=>{ const on=openingOn(E,o,p.Wf); return on && openingOwnHit(D,p,on); })
    && !zones.some(z=>zoneHit(p,z)));
}
// Erste freie Stelle an der Wand, ausgehend von x0 (sonst vom Anfang).
function freeSlot(E, K, L, it, Wf, near){
  const base=slotCandidates(E,K,L,it,Wf), d=dims(K,it).d;
  // Abgelegt an einer Stelle: die Stelle selbst zuerst (auf 10 mm), aber
  // nicht näher an die Ecke als die Front erlaubt. Ungerundet lassen: an
  // schiefen Ecken ist der Eckabstand krumm.
  const lo=cornerStop(E,Wf,d,0), hi=Wf.L-cornerStop(E,Wf,d,1)-it.w;
  if(near!=null) base.push(clamp(Math.round(near/10)*10, lo, Math.max(lo,hi)));
  const cand=[...new Set(base)];
  const ok=cand.filter(x=>fitsAt(E,K,L,it,Wf,x));
  if(!ok.length) return null;
  const ref = near!=null ? near : -Infinity;
  ok.sort((p,q)=>Math.abs(p-ref)-Math.abs(q-ref) || p-q);
  return near!=null ? ok[0] : Math.min(...ok);
}
// Einrasten beim Ziehen: nächster Kandidat innerhalb tol (mm).
function snapX(E, K, L, it, Wf, x, tol){
  let best=null;
  slotCandidates(E,K,L,it,Wf).forEach(c=>{ const d=Math.abs(c-x); if(d<=tol && (!best || d<best.d)) best={x:c,d}; });
  return best ? best.x : clamp(x, 0, Math.max(0, Wf.L-it.w));
}
// Nächste Wand zu einem Weltpunkt: Wandrahmen, s und Abstand.
// qOff: wie weit der Griffpunkt vor der Wand liegt (Ziehen an der Front
// eines tiefen Schranks soll nicht zur Nachbarwand springen). keepKey:
// aktuelle Wand, die bleibt, solange keine andere 100 mm näher ist.
function nearestWall(E, p, qOff=0, keepKey=null, minL=0){
  let best=null, keep=null;
  E.wallsByKey.forEach(W=>{
    const Wf=wallFrame(E, W.a, W.b); if(!Wf || Wf.L<minL) return;   // Wandstummel, auf die das Teil nicht passt
    const s=clamp(dot(sub(p,Wf.A),Wf.u), 0, Wf.L), q=dot(sub(p,Wf.A),Wf.n);
    const d=len(sub(p, wpt(Wf,s,Math.min(qOff, Math.max(0,q)))));
    if(q<-300) return;
    const c={Wf, s, q, d};
    if(!best || d<best.d) best=c;
    if(keepKey && Wf.key===keepKey) keep=c;
  });
  return keep && best && keep.d<=best.d+100 ? keep : best;
}

// ---------- Wege ----------
// Kürzeste Wege im Grundriss: Hindernisse (Schränke, Insel, Tisch) und
// Raum werden um r = halbe Körperbreite (300 mm) aufgeweitet; darauf ein
// Sichtbarkeitsgraph mit Dijkstra (Lozano-Pérez & Wesley 1979) - exakt
// kürzeste Polylinien, bei ein paar Dutzend Ecken billig.
const BODY_R=300;
function inflate(poly, r){
  const c=centroid(poly), R=poly.map(p=>({...p}));
  R.id=undefined;
  const ring=R.map((p,i)=>({x:p.x,y:p.y,id:'q'+i}));
  // insetRoom mit negativer Fuge = nach außen (Innenseite eines Hindernisses)
  const out=TL.insetRoom(ring, ()=>-r);
  // Ob nach innen oder außen gedreht: die größere Fläche gewinnt.
  const area=P=>Math.abs(TL.polyArea(P));
  if(area(out)<area(poly)){ const o2=TL.insetRoom(ring, ()=>r); return o2.map(p=>({x:p.x,y:p.y})); }
  return out.map(p=>({x:p.x,y:p.y}));
}
function planner(E, L, extra){
  const room=TL.insetRoom(E.ring, ()=>BODY_R);
  // core: der Körper selbst, poly: um die halbe Körperbreite aufgeweitet.
  const obs=L.G.filter(g=>g.it.kind!=='wall').map(g=>{ const core=g.foot||g.poly; return {id:g.it.id, core, poly:inflate(core, BODY_R)}; });
  // Zusätzliche Hindernisse (Kind im Weg): schon als Körper-Umriss.
  (extra||[]).forEach((poly,i)=>obs.push({id:'x'+i, core:poly, poly:inflate(poly, BODY_R)}));
  // Inseln des Raums sind schon in room.holes (nach außen aufgeweitet).
  // Dritter Wert: das Hindernis (Eintrag, nicht nur die id: Hauptteil und
  // Schenkel eines Eckschranks teilen sich eine), null bei der Raumwand.
  const segs=[];
  TL.ringsOf(room).forEach(R=>R.forEach((p,i)=>segs.push([p,R[(i+1)%R.length],null])));
  obs.forEach(o=>o.poly.forEach((p,i)=>segs.push([p,o.poly[(i+1)%o.poly.length],o])));
  const nodes=[];
  const push=(p,owner)=>nodes.push({x:p.x,y:p.y,owner});
  // Raumecken liegen genau auf dem Rand - dort entscheidet pointInRoom
  // zufällig, und einspringende Ecken (L-Raum, Pfeiler) fehlten als
  // Umlenkpunkt. Darum 2 mm entlang der Winkelhalbierenden ins Innere,
  // wie die Hindernisknoten; die Seite wählt der Punkttest selbst, so ist
  // die Umlaufrichtung von Außenring und Löchern egal.
  TL.ringsOf(room).forEach(R=>R.forEach((p,i)=>{
    const u=unit(sub(R[(i+R.length-1)%R.length],p)), v=unit(sub(R[(i+1)%R.length],p));
    let d=add(u,v); d=len(d)>1e-6 ? unit(d) : {x:-v.y, y:v.x};   // gestreckte Ecke: Normale
    const q=[add(p,mul(d,2)), add(p,mul(d,-2))].find(q=>TL.pointInRoom(q, room));
    if(q) push(q,null);
  }));
  obs.forEach(o=>{ const c=centroid(o.poly); o.poly.forEach(p=>push(add(p, mul(unit(sub(p,c)),2)), o.id)); });
  const inObs=(p,skip)=>obs.find(o=>!skip.has(o.id) && TL.pointInRing(p,o.poly));
  // R: Hindernis -> kleinere Aufweitung (Polygon) für diese Strecke, siehe
  // relaxOf; [] heißt: das Hindernis zählt nicht.
  const visible=(p,q,R)=>{
    for(const [a,b,o] of segs){ if(o && R && R.has(o)) continue; if(C.segCross(p,q,a,b)) return false; }
    if(R) for(const P of R.values()) for(let i=0;i<P.length;i++) if(C.segCross(p,q,P[i],P[(i+1)%P.length])) return false;
    const m=mul(add(p,q),0.5);
    for(const o of obs) if(TL.pointInRing(m, (R&&R.get(o))||o.poly)) return false;
    if(!TL.pointInRoom(m, room)) return false;
    return true;
  };
  // Knoten nur in der begehbaren Fläche: im Wandsaum (< 300 mm) geht niemand.
  const usable=nodes.filter(n=>TL.pointInRoom(n, room) && !inObs(n,new Set([n.owner])));
  const vis=new Map();
  const nb=i=>{ if(vis.has(i)) return vis.get(i); const out=[];
    for(let j=0;j<usable.length;j++) if(j!==i && visible(usable[i],usable[j])) out.push([j,len(sub(usable[i],usable[j]))]);
    vis.set(i,out); return out; };
  // Punkt im Wandsaum oder in einer Pfeiler-Aufweitung: auf den Rand der
  // begehbaren Fläche ziehen; das Stück dorthin zählt mit.
  const snapIn=p=>{
    if(TL.pointInRoom(p, room)) return p;
    const nr=TL.nearestOnRing(room, p); if(!nr) return p;
    const d=unit(sub(nr.q,p)); return add(nr.q, mul(d,1));
  };
  // Start/Ziel in der Aufweitung eines Hindernisses (Stand neben einem
  // Hochschrank, Platz am Tisch, Kind): dort kann man stehen, also auch dicht
  // vorbeigehen. Früher zählte so ein Hindernis für den ganzen Weg nicht
  // (skip): die Wege liefen mitten durch Hochschrank, Insel und Kind. Jetzt
  // gilt für diesen Weg eine kleinere Aufweitung: je Kante nur so weit, wie
  // der Punkt von ihrer Geraden schon entfernt steht. Je Kante, nicht
  // einheitlich: wer in der Ecke vor einem Nachbarn steht, kommt nach vorn
  // weg, auch wenn er seitlich 300 mm Platz hat. R: Hindernis -> Polygon.
  // Steht der Punkt im Körper selbst (das Kind auf dem Standpunkt,
  // überlappende Teile), gilt [] (das Hindernis zählt nicht): ab dort kann man
  // es nur verlassen, und eine Gerade verlässt einen konvexen Körper einmal.
  const relaxPoly=(core, ts)=>{
    const xs=core.map(q=>q.x), ys=core.map(q=>q.y), x0=Math.min(...xs)-1500, x1=Math.max(...xs)+1500, y0=Math.min(...ys)-1500, y1=Math.max(...ys)+1500;
    let P=[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
    TL.edgesOf(core).forEach((e,i)=>{ const off=ts[i]>1 ? Math.min(BODY_R, ts[i]-0.5) : ts[i]>0 ? ts[i]/2 : BODY_R;
      P=TL.clipHalf(P, add(e.a, mul(e.n,off)), mul(e.n,-1)); });
    return P;
  };
  const relaxOf=p=>{
    let R=null;
    obs.forEach(o=>{
      const ts=TL.edgesOf(o.core).map(e=>dot(sub(p,e.a),e.n)), tm=Math.max(...ts);
      if(tm>=BODY_R+1) return;
      (R=R||new Map()).set(o, tm<=0 ? [] : relaxPoly(o.core, ts));
    });
    return R;
  };
  // Ohne die Körper, in denen der Punkt selbst steht: für Strecken, die nicht
  // bei ihm beginnen (wer den Körper verlassen hat, kommt nicht zurück).
  const outsideR=R=>{ if(!R) return null; const M=new Map(); R.forEach((P,o)=>{ if(P.length) M.set(o,P); }); return M.size ? M : null; };
  // Beide Enden gelockert: je Hindernis die kleinere Aufweitung.
  const bothR=(R1,R2)=>{
    if(!R1 || !R2) return R1||R2;
    const M=new Map(R1);
    R2.forEach((P,o)=>{ const Q=M.get(o); if(!Q || !P.length || (Q.length && Math.abs(TL.polyArea(P))<Math.abs(TL.polyArea(Q)))) M.set(o,P); });
    return M;
  };
  // Ein Endpunkt (je Punkt einmal gerechnet): gelockerte Hindernisse und, wenn
  // es welche gibt, die Ecken der kleineren Aufweitung als Umlenkpunkte. S:
  // Punkt und Ecken mit kürzester Länge d von ihm (über chain die
  // Zwischenpunkte); d/via je Knoten: kürzester Weg vom Punkt über die Ecken
  // zu diesem Knoten (Infinity: keiner).
  const endMemo=new Map();
  const endOf=p0=>{
    const key=p0.x.toFixed(2)+','+p0.y.toFixed(2); let e=endMemo.get(key); if(e) return e;
    const p=snapIn(p0), R=relaxOf(p), Rx=outsideR(R), S=[{p, d:0, chain:[]}];
    e={A: p===p0 ? [p0] : [p0,p], stub:len(sub(p,p0)), p, R, Rx, S, d:null, via:null};
    if(R){
      R.forEach(P=>{ if(!P.length) return; const c=centroid(P);
        P.forEach(q=>{ const n=add(q, mul(unit(sub(q,c)),2));
          if(TL.pointInRoom(n, room) && !obs.some(o=>TL.pointInRing(n,(Rx&&Rx.get(o))||o.poly))) S.push({p:n, d:Infinity, chain:null}); }); });
      const done=new Set();
      for(;;){
        let i=-1; S.forEach((x,k)=>{ if(!done.has(k) && x.d<Infinity && (i<0 || x.d<S[i].d)) i=k; });
        if(i<0) break;
        done.add(i);
        S.forEach((y,k)=>{ if(done.has(k)) return; const t=S[i].d+len(sub(S[i].p,y.p));
          if(t<y.d && visible(S[i].p,y.p,i ? Rx : R)){ y.d=t; y.chain=[...S[i].chain, y.p]; } });
      }
      e.d=new Float64Array(usable.length).fill(Infinity); e.via=new Array(usable.length).fill(null);
      S.forEach((x,i)=>{ if(x.d===Infinity) return;
        usable.forEach((u,j)=>{ const t=x.d+len(sub(x.p,u)); if(t<e.d[j] && visible(x.p,u,i ? Rx : R)){ e.d[j]=t; e.via[j]=x.chain; } }); });
    }
    endMemo.set(key,e); return e;
  };
  function route(a0, b0){
    const ea=endOf(a0), eb=endOf(b0), a=ea.p, b=eb.p, stub=ea.stub+eb.stub;
    const wrap=(core,l)=>({len:l+stub, path:[...ea.A.slice(0,-1),...core,...eb.A.slice(0,-1).reverse()].filter((p,i,arr)=>i===0||len(sub(p,arr[i-1]))>0.5).map(p=>({x:p.x,y:p.y})), ok:true});
    if(visible(a,b,bothR(ea.R,eb.R))) return wrap([a,b], len(sub(a,b)));
    // Ohne Knoten dazwischen: von einer Ecke der einen Seite zu einer der anderen.
    let best=Infinity, meet=null;
    if(ea.S.length>1 || eb.S.length>1) ea.S.forEach((x,i)=>eb.S.forEach((y,k)=>{
      const t=x.d+len(sub(x.p,y.p))+y.d;
      if((i||k) && t<best && x.d<Infinity && y.d<Infinity && visible(x.p,y.p,bothR(i ? ea.Rx : ea.R, k ? eb.Rx : eb.R))){ best=t; meet=[x,y]; } }));
    const N=usable.length, dist=new Float64Array(N+1).fill(Infinity), prev=new Int32Array(N+1).fill(-1), done=new Uint8Array(N+1);
    for(let j=0;j<N;j++){
      if(ea.d){ if(ea.d[j]<Infinity){ dist[j]=ea.d[j]; prev[j]=-2; } }
      else if(visible(a,usable[j])) { dist[j]=len(sub(a,usable[j])); prev[j]=-2; }
    }
    let bestFrom=-1;
    for(;;){
      let i=-1, m=Infinity;
      for(let j=0;j<N;j++) if(!done[j] && dist[j]<m){ m=dist[j]; i=j; }
      if(i<0 || m>=best) break;
      done[i]=1;
      const tail=eb.d ? eb.d[i] : visible(usable[i], b) ? len(sub(usable[i],b)) : Infinity;
      if(tail<Infinity){ const t=m+tail; if(t<best){ best=t; bestFrom=i; } }
      for(const [j,w] of nb(i)) if(!done[j] && m+w<dist[j]){ dist[j]=m+w; prev[j]=i; }
    }
    // Kein Durchkommen (Engstelle < 600 mm): ehrlich als gesperrt melden.
    if(bestFrom<0 && !meet) return {len:len(sub(a0,b0)), path:[a0,b0], ok:false};
    if(bestFrom<0) return wrap([a, ...meet[0].chain, ...meet[1].chain.slice().reverse(), b], best);
    const core=[b]; let k=bestFrom, first=k;
    while(k>=0){ core.push(usable[k]); first=k; k=prev[k]; }
    core.push(a); core.reverse();
    const out=core.slice();
    // über die Ecken einer kleineren Aufweitung hinaus bzw. hinein
    if(ea.via && ea.via[first]) out.splice(1,0,...ea.via[first]);
    if(eb.via && eb.via[bestFrom]) out.splice(out.length-1,0,...eb.via[bestFrom].slice().reverse());
    return wrap(out, best);
  }
  return {route};
}
// Stationen: wo man steht, um etwas zu tun (NKBA misst ab Frontmitte).
const STAND=350;
function standAt(g, S){
  if(g.cornerFront) return add(g.cornerFront, mul(g.cornerOut, STAND));
  const cb=S && !g.free ? cornerBlind(g,S) : null;
  if(cb){ const s=cb.atS0 ? (g.s0+cb.b+g.s1)/2 : (g.s0+g.s1-cb.b)/2; return wpt(g.Wf, s, g.d+STAND); }
  return add(g.frontMid, mul(g.n, STAND));
}
function stations(E, K, L){
  const S={};
  const put=(role, p, id)=>{ (S[role]=S[role]||[]).push({p, id}); };
  L.G.forEach(g=>{
    const it=g.it;
    if(g.wing) return;                                  // zweiter Schenkel: Stationen am Hauptteil
    if(it.kind==='table'){
      // Am Tisch: die Seite, die zur Küche zeigt (nächster Schrank), und zwar
      // eine mit Stuhlraum: an einer zugestellten (Stirn an Stirn mit der Insel,
      // Wand) läge der Stand im anderen Möbel. Ohne offene Seite die mit dem
      // meisten Platz.
      const others=L.G.filter(h=>h.it.kind!=='table' && h.it.kind!=='wall');
      const ref=others.length ? centroid(others.map(h=>h.frontMid)) : add(g.c, g.n);
      const room=s=>Math.min(s.room, SEAT_ROOM);
      const side=tableSides(g,E,L).sort((p,q)=>room(q)-room(p) || len(sub(p.mid,ref))-len(sub(q.mid,ref)))[0];
      put('tisch', add(side.mid, mul(side.n, STAND)), it.id);
      return;
    }
    const st=standAt(g, K.spec);
    if(it.dev==='sink') put('sink', st, it.id);
    if(it.dev==='dw') put('dw', st, it.id);
    if(it.dev==='hob') put('hob', st, it.id);
    if(it.dev==='fridge') put('kuehl', st, it.id);
    (it.store||[]).forEach(c=>{ if(c!=='kuehl' || it.dev!=='fridge') put(c, st, it.id); });
  });
  // Arbeitsfläche: Platte ohne Gerät, am nächsten zur Mitte Spüle–Herd.
  const sink=(S.sink||[])[0], hob=(S.hob||[])[0];
  const ref=sink&&hob ? mul(add(sink.p,hob.p),0.5) : (sink||hob) ? (sink||hob).p : null;
  // Stand wie bei allen Stationen (standAt): bei Über-Eck und Halbeck liegt
  // er nicht vor der Frontmitte des Hauptteils (Nachbarschrank, Blende).
  const preps=L.G.filter(g=>(g.it.kind==='base'||g.it.kind==='island') && !g.it.dev && !g.wing);
  if(preps.length){
    const at=g=>standAt(g, K.spec);
    const g=ref ? preps.sort((p,q)=>len(sub(at(p),ref))-len(sub(at(q),ref)))[0] : preps[0];
    put('prep', at(g), g.it.id);
  }
  // Eingang: gewählte Tür, sonst die erste. 450 mm im Raum vor der Tür.
  const doors=entries(E);
  const door=doors.find(o=>o.id===K.spec.entry) || doors[0];
  if(door){
    const Wf=wallFrame(E,door.a,door.b), on=Wf&&openingOn(E,door,Wf);
    if(on) put('eingang', wpt(Wf,(on.s0+on.s1)/2,450), null);
  }
  return S;
}
// Mögliche Eingänge: Türen zuerst, dann Durchgänge ab dem Boden.
function entries(E){
  return E.openings.filter(o=>o.kind==='door' || (o.kind==='hole' && (o.y||0)<=50 && o.h>=1800))
    .sort((p,q)=>(p.kind==='door'?0:1)-(q.kind==='door'?0:1));
}
// Eingangs-Auswahl als <option>-Liste (renderWays). Hier statt im UI-Block,
// damit der Selbsttest sie prüft: die ids stammen aus der Raumdatei (Import,
// geteilter Link) und gehen escaped ins Attribut. Gewählt wie in stations().
function entryOptions(doors, entry){
  const cur=doors.find(o=>o.id===entry) || doors[0];
  return doors.map((o,i)=>`<option value="${escapeHtml(o.id)}"${o===cur?' selected':''}>${o.kind==='door'?'Tür':'Durchgang'} ${i+1} (${Math.round(o.w/10)} cm)</option>`).join('');
}
// Gewicht je Station für das Umsortieren: wie gut greifbar (Blum-Ebenen,
// NKBA 38–122 cm für Häufiges). Auszug unten schlägt Tür unten.
function reachFactor(K, g, zone){
  if(!g) return 1;
  const D=derived(K.spec), it=g.it, fk=frontKind(it);
  let z;
  if(it.kind==='wall') z=g.z0+150;
  else if(tallDev(it)){   // Fächer über/unter dem Gerät: je Fach seine Höhe
    const Z=devZones(it,K.spec), f=zone || Z[Z.length-1]; z=f ? (f.z0+f.z1)/2 : 1200; }
  else if(it.kind==='tall') z=1200;
  else z = fk==='drawer' ? D.workH-200 : 450;
  let h = zReach(z);
  if(fk==='drawer' && it.kind!=='wall') h*=0.8;
  return h;
}
// Alle Abläufe auswerten. assign überschreibt, welcher Inhalt in welchem
// Schrank liegt ({inhalt:[ids]}), fürs Durchrechnen von Vorschlägen.
function flows(E, K, L, opts){
  opts=opts||{};
  const St=stations(E,K,L), pl=opts.planner||planner(E,L);
  const memo=opts.memo||new Map();
  const route=(a,b)=>{ const k=a.p.x.toFixed(0)+','+a.p.y.toFixed(0)+'>'+b.p.x.toFixed(0)+','+b.p.y.toFixed(0);
    if(!memo.has(k)) memo.set(k, pl.route(a.p,b.p)); return memo.get(k); };
  const where=role=>{
    if(opts.assign && opts.assign[role]) return opts.assign[role].map(id=>{ const g=L.byId.get(id); return g ? {p:standAt(g,K.spec), id} : null; }).filter(Boolean);
    return St[role]||[];
  };
  const res=[], missing=new Set();
  let total=0, cost=0;
  FLOWS.forEach(F=>{
    let m=0, c=0, blocked=0; const legs=[]; const miss=new Set();
    // Ehrlich zählen: fehlt eine Station, zählt
    // der ganze Ablauf nicht – sonst stiege die Summe mit jedem Inhalt.
    F.chains.flat().forEach(r=>{ if(!where(r).length) miss.add(r); });
    const complete = miss.size===0;
    if(complete || opts.partial) F.chains.forEach(ch=>{
      // Stationen je Kette so wählen, dass die ganze Kette am kürzesten ist
      // (bei mehreren Schränken mit gleichem Inhalt, mehreren Spülen …).
      const roles=ch.filter(r=>{ if(where(r).length) return true; miss.add(r); return false; });
      if(roles.length<2) return;
      const Cs=roles.map(where);
      const legLen=(i,a,b)=>{ if(a.id!=null && a.id===b.id && roles[i-1]===roles[i]) return 0; const r=route(a,b); return r.ok ? r.len : r.len*4+50000; };
      let layer=Cs[0].map(()=>({v:0, prev:-1}));
      const layers=[layer];
      for(let i=1;i<roles.length;i++){
        layer=Cs[i].map(b=>{ let v=Infinity, pv=-1; Cs[i-1].forEach((a,k)=>{ const t=layers[i-1][k].v+legLen(i,a,b); if(t<v){ v=t; pv=k; } }); return {v, prev:pv}; });
        layers.push(layer);
      }
      let j=layer.reduce((bj,x,k)=>x.v<layer[bj].v?k:bj,0);
      const stops=[];
      for(let i=roles.length-1;i>=0;i--){ stops.unshift({role:roles[i], ...Cs[i][j]}); j=layers[i][j].prev; }
      for(let i=1;i<stops.length;i++){
        const a=stops[i-1], b=stops[i];
        if(a.id!=null && a.id===b.id && a.role===b.role) continue;
        const r=route(a,b), k=F.back?2:1;
        const rf=st=>{ if(!CKEY.has(st.role)) return 1; const g=L.byId.get(st.id); return reachFactor(K, g, g && tallDev(g.it) ? dwZoneFor(g.it,K.spec,st.role,opts.assign && heldIn(opts.assign,st.id)) : null); };
        const hf=rf(a)*rf(b);
        legs.push({from:a.role, to:b.role, path:r.path, len:r.len, ok:r.ok});
        if(!r.ok){ blocked++; c+=50000*k; continue; }   // gesperrt: nicht in die Meter, aber teuer
        m+=r.len*k; c+=r.len*k*hf;
      }
    });
    miss.forEach(x=>missing.add(x));
    total+=m*F.f; cost+=c*F.f;
    res.push({key:F.key, label:F.label, group:F.group, f:F.f, m, week:m*F.f, legs, missing:[...miss], blocked, complete});
  });
  return {flows:res, week:total, kmYear:total*52/1e6, cost, missing:[...missing], stations:St, planner:pl, memo,
          complete:res.filter(f=>f.complete).length};
}
// Umsortieren: welcher Inhalt in welchen Schrank, damit die gewichteten
// Laufmeter sinken? Gierig, je Schritt der beste Umzug oder Tausch, bis
// zu n Vorschläge. Kühlware bleibt im Kühlschrank, Müll und Töpfe unten.
function suggest(E, K, L, n=3){
  const base=flows(E,K,L);
  const pl=base.planner, memo=base.memo;
  const noStore=g=>storable(g.it,K.spec).length===0;
  const cabinets=L.G.filter(g=>['base','wall','tall','island'].includes(g.it.kind) && !noStore(g) && !g.wing);
  const assign={};
  CONTENTS.forEach(c=>{ if(!c.fixed) assign[c.key]=L.G.filter(g=>!g.wing && (g.it.store||[]).includes(c.key)).map(g=>g.it.id); });
  // Müll und Putzmittel gehören an die Spüle (NKBA: ein Behälter dort).
  const pinned=(k,g)=>(k==='muell'||k==='putz') && g && g.it.dev==='sink';
  // Regeln wie im Panel (storable), dazu: Besteck und Messer nur in Schubladen.
  const allowed=(c,g)=>storable(g.it,K.spec).includes(c) && (!(c==='besteck'||c==='messer') || frontKind(g.it)==='drawer');
  const fits=(g,list)=>storeFits(g.it,K.spec,list);
  const load=a=>{ const m=new Map(); Object.entries(a).forEach(([c,ids])=>ids.forEach(id=>m.set(id,(m.get(id)||[]).concat(c)))); return m; };
  // Bewertet werden auch halbe Abläufe, sonst zählt Einräumen erst, wenn alles da ist.
  const evalA=a=>flows(E,K,L,{assign:a, planner:pl, memo, partial:true}).cost;
  const honest=a=>flows(E,K,L,{assign:a, planner:pl, memo});
  const start={...assign};
  let cur={...assign};
  // 1. Einräumen: Inhalte ohne Platz, die in Abläufen vorkommen, häufigste zuerst.
  const unplaced=[];
  const use={}; FLOWS.forEach(F=>F.chains.flat().forEach(r=>{ if(r in cur) use[r]=(use[r]||0)+F.f; }));
  Object.keys(use).filter(c=>!cur[c].length).sort((p,q)=>use[q]-use[p]).forEach(c=>{
    const ld=load(cur); let best=null;
    const sinkFree=cabinets.some(g=>g.it.dev==='sink' && allowed(c,g) && fits(g,[...(ld.get(g.it.id)||[]),c]));
    cabinets.forEach(g=>{ if(!allowed(c,g) || !fits(g,[...(ld.get(g.it.id)||[]),c])) return;
      if((c==='muell'||c==='putz') && sinkFree && g.it.dev!=='sink') return;
      const v=evalA({...cur,[c]:[g.it.id]}); if(!best || v<best.v) best={v, id:g.it.id}; });
    if(best) cur={...cur,[c]:[best.id]}; else unplaced.push(c);
  });
  const placed={...cur};
  // 2. Umsortieren: gierig, je Schritt der beste Umzug oder Tausch.
  let curCost=evalA(cur);
  for(let step=0; step<n; step++){
    let best=null;
    const ld=load(cur);
    Object.entries(cur).forEach(([c,ids])=>{
      if(ids.length!==1) return;                      // nur eindeutig verortete Inhalte
      const from=ids[0];
      const fg0=L.byId.get(from); if(pinned(c,fg0)) return;
      cabinets.forEach(g=>{
        if(g.it.id===from || !allowed(c,g)) return;
        const there=ld.get(g.it.id)||[];
        const tries=[];
        if(fits(g,[...there,c])) tries.push(null);
        const fg=L.byId.get(from), here=ld.get(from)||[];
        // Tausch ändert die Anzahl nicht; nur Hochschränke mit Gerät (je Fach
        // ein Inhalt, ein niedriges unteres Fach nur Untenzeug) müssen die
        // neue Belegung tragen.
        const swapOk=(h,list)=>!tallDev(h.it) || fits(h,list);
        there.forEach(x=>{ if(cur[x].length===1 && fg && allowed(x,fg) && !pinned(x,g)
          && swapOk(g,[...there.filter(y=>y!==x),c]) && swapOk(fg,[...here.filter(y=>y!==c),x])) tries.push(x); });
        tries.forEach(sw=>{
          const a={...cur, [c]:[g.it.id]}; if(sw) a[sw]=[from];
          const v=evalA(a);
          if(v<curCost-1 && (!best || v<best.v)) best={v, a};
        });
      });
    });
    if(!best || (curCost-best.v)*52/1e6<0.2) break;    // unter 0,2 km/Jahr lohnt nicht
    cur=best.a; curCost=best.v;
  }
  // Netto: was liegt am Ende anders als jetzt? (ein Tausch = zwei Umzüge)
  const out=[];
  Object.keys(cur).forEach(c=>{
    const a=start[c]||[], b=cur[c]||[];
    if(!a.length && b.length) out.push({c, from:null, to:b[0], place:true});
    else if(a.length===1 && b.length===1 && a[0]!==b[0]) out.push({c, from:a[0], to:b[0]});
  });
  out.sort((p,q)=>(q.place?1:0)-(p.place?1:0));
  // Umzüge, die sich einen Schrank teilen (Tausch, Kette, Einräumen nach
  // Auszug), gehören zusammen – einzeln übernommen überfüllen sie Schränke.
  const par=new Map(), f=x=>{ while(par.get(x)!==x) x=par.get(x); return x; };
  out.forEach(m=>{ [m.from,m.to].forEach(x=>{ if(x!=null && !par.has(x)) par.set(x,x); }); if(m.from!=null) par.set(f(m.from), f(m.to)); });
  out.forEach(m=>{ m.grp=f(m.to); });
  out.reachDelta=reachDelta(K,L,out,start,cur);
  const hb=honest(start), ha=honest(cur);
  // Vergleichbar ist nur „nach dem Einräumen“ gegen „nach dem Umsortieren“
  // (Einräumen macht Abläufe erst vollständig, die Summe steigt dabei).
  out.kmBefore=hb.kmYear; out.kmPlaced=honest(placed).kmYear; out.kmAfter=ha.kmYear; out.completeBefore=hb.complete; out.completeAfter=ha.complete;
  out.assign=cur; out.unplaced=unplaced;
  return out;
}
// Optimal einräumen (Meldung M-20261109-150126-3b7705): jeder Inhalt in
// genau einen Schrank, so dass die gewichteten Wege aller Abläufe minimal
// sind - exakt und deterministisch, keine Heuristik. Das geht, weil jede
// Kette in FLOWS höchstens EINEN Inhalt enthält: die Kosten zerfallen in
// eine Summe je (Inhalt, Schrank), und das Ganze ist ein Zuordnungsproblem
// mit Schrankkapazitäten (Ungarische Methode über Kapazitäts-Plätze).
// Was der Nutzer bewusst doppelt eingeräumt hat (Teller in zwei Schränken),
// bleibt stehen und belegt seine Plätze - doppelt ist der Weg kürzer, als
// es eine Einzelzuordnung je sein kann.
// Regeln wie beim Umsortieren: storable, Besteck/Messer nur in Schubladen,
// Müll und Putzmittel an die Spüle (wenn sie dort Platz haben). Inhalte ohne
// Ablauf (Backbleche, Seltenes; Putzmittel) nehmen die schlechter
// greifbaren Plätze und lassen die guten frei.
// Nie etwas herausnehmen (Review L8053): was eingeräumt ist, bleibt
// eingeräumt - umgezogen, oder, wenn kein passender Platz frei ist, gegen die
// Regel an seinem Ort (kept, mit Grund). Reicht der Platz nicht für alles, was
// noch fehlt, bleibt das Seltenste draußen (Review L8043): „nicht
// eingeräumt“ kostet je Inhalt nach seiner Häufigkeit in den Abläufen.
function hungarian(C){
  // C: n Zeilen × m Spalten, n ≤ m. Minimiert Σ C[i][p[i]]. (e-maxx, Potentiale)
  const n=C.length, m=C[0].length, u=new Array(n+1).fill(0), v=new Array(m+1).fill(0), p=new Array(m+1).fill(0), way=new Array(m+1).fill(0);
  for(let i=1;i<=n;i++){
    p[0]=i; let j0=0; const minv=new Array(m+1).fill(Infinity), used=new Array(m+1).fill(false);
    do{
      used[j0]=true; const i0=p[j0]; let delta=Infinity, j1=0;
      for(let j=1;j<=m;j++) if(!used[j]){
        const cur=C[i0-1][j-1]-u[i0]-v[j];
        if(cur<minv[j]){ minv[j]=cur; way[j]=j0; }
        if(minv[j]<delta){ delta=minv[j]; j1=j; }
      }
      for(let j=0;j<=m;j++){ if(used[j]){ u[p[j]]+=delta; v[j]-=delta; } else minv[j]-=delta; }
      j0=j1;
    } while(p[j0]!==0);
    do{ const j1=way[j0]; p[j0]=p[j1]; j0=j1; } while(j0);
  }
  const res=new Array(n).fill(-1);
  for(let j=1;j<=m;j++) if(p[j]) res[p[j]-1]=j-1;
  return res;
}
// Was an einer Belegung gegen die Regeln verstößt: je Inhalt „nicht“
// (storable), „schublade“ (Besteck/Messer); je Schrank „voll“ (mehr als
// storeCap) oder „fach“ (hohe Spülmaschine: Fächer passen nicht).
function storeBreaks(K, L, assign){
  const out=[], on=new Map();
  Object.entries(assign).forEach(([c,ids])=>ids.forEach(id=>on.set(id,[...(on.get(id)||[]),c])));
  on.forEach((list,id)=>{ const g=L.byId.get(id); if(!g) return;
    const ok=storable(g.it,K.spec);
    list.forEach(c=>{ if(!ok.includes(c)) out.push({c, id, why:'nicht'});
      else if((c==='besteck'||c==='messer') && frontKind(g.it)!=='drawer') out.push({c, id, why:'schublade'}); });
    if(!storeFits(g.it,K.spec,list)) out.push({id, why:list.length>storeCap(g.it,K.spec) ? 'voll' : 'fach', list});
  });
  return out;
}
function optimalStore(E, K, L){
  const base=flows(E,K,L), pl=base.planner, memo=base.memo;
  const evalA=a=>flows(E,K,L,{assign:a, planner:pl, memo, partial:true}).cost;
  const honest=a=>flows(E,K,L,{assign:a, planner:pl, memo});
  const cabinets=L.G.filter(g=>['base','wall','tall','island'].includes(g.it.kind) && storable(g.it,K.spec).length && !g.wing);
  const allowed=(c,g)=>storable(g.it,K.spec).includes(c) && (!(c==='besteck'||c==='messer') || frontKind(g.it)==='drawer');
  const cap=g=>storeCap(g.it,K.spec);
  const keys=CONTENTS.filter(c=>!c.fixed).map(c=>c.key);
  // Plätze: je Schrank cap viele; Hochschränke mit Gerät je Fach einen, mit
  // eigener Regel (niedriges Fach unten nur DW_LOW) und eigener Greifhöhe.
  const start={}; keys.forEach(k=>{ start[k]=L.G.filter(g=>!g.wing && (g.it.store||[]).includes(k)).map(g=>g.it.id); });
  const fixed=keys.filter(k=>start[k].length>1);
  const empty={}; keys.forEach(k=>{ empty[k]=fixed.includes(k) ? start[k] : []; });
  const used=new Map(); fixed.forEach(k=>start[k].forEach(id=>used.set(id,(used.get(id)||0)+1)));
  const free=keys.filter(k=>!fixed.includes(k));
  const inFlow=new Set(); FLOWS.forEach(F=>F.chains.flat().forEach(r=>{ if(keys.includes(r)) inFlow.add(r); }));
  // Nutzen je Inhalt: Gänge je Woche in den Abläufen (Rückweg doppelt).
  const use=c=>FLOWS.reduce((s,F)=>s+(F.chains.flat().includes(c) ? F.f*(F.back?2:1) : 0),0);
  // Kosten in Stufen, jede schlägt alle darunter: verboten (INF) > Eingeräumtes
  // herausnehmen (LOSE) > gegen die Regel bleiben lassen (KEEP) > Fehlendes nicht
  // einräumen (UNPLACED, plus Nutzen) > Müll/Putz nicht an der Spüle > Wege.
  const E0=evalA(empty), INF=1e15, LOSE=1e13, KEEP=2e12, UNPLACED=1e12, USE=1e9;
  const miss=c=>(start[c].length ? LOSE : UNPLACED)+USE*use(c);
  const atSink=c=>(c==='muell'||c==='putz') && cabinets.some(g=>g.it.dev==='sink' && allowed(c,g));
  const walk=new Map();
  const cost=(c,s)=>{
    const g=s.g, was=start[c].includes(g.it.id);
    // Überzählige Plätze und Regelverstöße nur für das, was schon dort liegt.
    if(s.over || !allowed(c,g) || (s.z && s.z.only && !s.z.only.includes(c))) return was ? KEEP : INF;
    if(atSink(c) && g.it.dev!=='sink') return 1e10;
    const rf=reachFactor(K,g,s.z), k=c+'|'+g.it.id;
    if(inFlow.has(c) && !walk.has(k)) walk.set(k, evalA({...empty,[c]:[g.it.id]})-E0);
    return inFlow.has(c) ? walk.get(k) + rf : 2.5-rf;   // ohne Ablauf: lieber schlecht greifbar, nie unter 0
  };
  const slots=[]; cabinets.forEach(g=>{
    const Z=devZones(g.it,K.spec);
    if(Z.length){                                    // Hochschrank mit Gerät: Fächer, doppelt Eingeräumtes belegt sie
      const taken=fixed.filter(k=>start[k].includes(g.it.id)), rest=[...Z];
      taken.forEach(k=>{ const i=rest.findIndex(z=>z.only && z.only.includes(k)); rest.splice(i>=0?i:rest.length-1,1); });
      rest.forEach(z=>slots.push({g, z}));
    } else for(let k=used.get(g.it.id)||0;k<cap(g);k++) slots.push({g});
  });
  // Was jetzt über storeCap hinaus (oder in einem Teil ohne Stauraum) liegt,
  // bekommt dort Plätze zum Bleiben - genutzt nur, wenn sonst nichts frei ist.
  L.G.forEach(g=>{ if(g.wing) return;
    const load=keys.filter(k=>start[k].includes(g.it.id)).length, n=cabinets.includes(g) ? cap(g) : 0;
    for(let k=n;k<load;k++) slots.push({g, over:true}); });
  const assign={}, unplaced=[], kept=[], whyNot=(c,s)=>!storable(s.g.it,K.spec).includes(c) ? 'nicht' : (c==='besteck'||c==='messer') && frontKind(s.g.it)!=='drawer' ? 'schublade' : s.over ? 'voll' : 'fach';
  fixed.forEach(k=>{ assign[k]=[...start[k]]; });
  if(free.length){
    const rows=free.map(c=>[...slots.map(s=>cost(c,s)), ...free.map(()=>miss(c))]);
    const pick=hungarian(rows);
    free.forEach((c,i)=>{ const j=pick[i], s=j<slots.length ? slots[j] : null;
      if(s && rows[i][j]<INF/2){ assign[c]=[s.g.it.id]; if(rows[i][j]>=KEEP) kept.push({c, id:s.g.it.id, why:whyNot(c,s)}); }
      else { assign[c]=[]; unplaced.push(c); } });
  }
  const same=keys.every(k=>JSON.stringify([...start[k]].sort())===JSON.stringify([...assign[k]].sort()));
  const hb=honest(start), ha=honest(assign), cs=evalA(start), co=evalA(assign);
  // Vergleichbar sind nur gleich vollständige Einteilungen: kommt etwas dazu
  // (und fehlt nichts), ist das Fortschritt, auch wenn die Summe steigt; ein
  // behobener Regelverstoß ebenso. Weniger Eingeräumtes ist nie „besser“.
  // dropped bleibt leer (KEEP-Plätze), steht hier nur als Absicherung.
  const dropped=unplaced.filter(k=>start[k].length);
  const violations=storeBreaks(K,L,start), after=storeBreaks(K,L,assign);
  const placedBefore=keys.filter(k=>start[k].length).length, placedAfter=keys.filter(k=>assign[k].length).length;
  const better=!dropped.length && (placedAfter>placedBefore || after.length<violations.length || co<cs-1);
  return {assign, unplaced, fixed, kept, dropped, violations, violationsAfter:after, same, better, placedBefore, placedAfter, kmBefore:hb.kmYear, kmAfter:ha.kmYear, completeBefore:hb.complete, completeAfter:ha.complete,
          cost:co, costStart:cs, costSum:E0+free.reduce((s,c)=>s+(assign[c].length && inFlow.has(c) ? evalA({...empty,[c]:assign[c]})-E0 : 0),0)};
}

// ---------- Wege-Analyse (Meldungen M-20261109-151457-68b975, -151540-54f941) ----------
// Heatmap: wie oft wird wo gelaufen. Jeder Weg aller vollständigen Abläufe
// zählt mit seiner Häufigkeit je Woche (Rückweg doppelt), aufgetragen auf
// ein Raster (cell mm) und einmal 3×3 geglättet.
function heatGrid(E, R, cell=100){
  const P=TL.ringsOf(E.ring)[0]; let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  P.forEach(p=>{ x0=Math.min(x0,p.x); y0=Math.min(y0,p.y); x1=Math.max(x1,p.x); y1=Math.max(y1,p.y); });
  const nx=Math.max(1,Math.ceil((x1-x0)/cell)), ny=Math.max(1,Math.ceil((y1-y0)/cell)), v=new Float32Array(nx*ny);
  R.flows.forEach(f=>{ if(!f.complete) return; const k=f.f*(FLOWS.find(F=>F.key===f.key).back?2:1);
    f.legs.forEach(l=>{ if(!l.ok) return; for(let i=1;i<l.path.length;i++){ const a=l.path[i-1], b=l.path[i], d=len(sub(b,a)), n=Math.max(1,Math.ceil(d/(cell/2)));
      for(let j=0;j<n;j++){ const p=add(a,mul(sub(b,a),(j+0.5)/n)), ix=Math.floor((p.x-x0)/cell), iy=Math.floor((p.y-y0)/cell);
        if(ix>=0 && iy>=0 && ix<nx && iy<ny) v[iy*nx+ix]+=k*d/n/1000; } } }); });
  const w=new Float32Array(nx*ny);
  for(let iy=0;iy<ny;iy++) for(let ix=0;ix<nx;ix++){ let s=0, c=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const x=ix+dx, y=iy+dy; if(x<0||y<0||x>=nx||y>=ny) continue; const q=(dx||dy)?((dx&&dy)?1:2):4; s+=v[y*nx+x]*q; c+=q; }
    w[iy*nx+ix]=s/c; }
  let max=0, at=null; for(let i=0;i<w.length;i++) if(w[i]>max){ max=w[i]; at={x:x0+(i%nx+0.5)*cell, y:y0+(Math.floor(i/nx)+0.5)*cell}; }
  return {x0, y0, nx, ny, cell, v:w, max, peak:at};
}
// Kind im Weg: eine Scheibe (Ø 600) am meistbelaufenen Punkt – der
// ungünstigste Ort, deterministisch aus der Heatmap.
function kidPoly(p, r=300){ const out=[]; for(let i=0;i<8;i++){ const a=i*Math.PI/4; out.push({x:p.x+Math.cos(a)*r, y:p.y+Math.sin(a)*r}); } return out; }
// Zu zweit in der Küche: welche Abläufe laufen gleichzeitig, und wo kommen
// sich die beiden in die Quere? Begegnung = Wegstück, auf dem die andere
// Person näher als zwei Körperbreiten (2 × 300 mm) läuft. EIGENE ANNAHME,
// welche Abläufe gleichzeitig laufen.
const PAIRS=[
  {a:'kochen', b:'decken',   label:'Kochen + Tisch decken'},
  {a:'kochen', b:'kaffee',   label:'Kochen + Getränke holen'},
  {a:'kochen', b:'snack',    label:'Kochen + Snack'},
  {a:'kochen', b:'einkauf',  label:'Kochen + Einkauf einräumen'},
  {a:'abraeumen', b:'kaffee',label:'Abräumen + Getränke holen'},
];
const MEET=2*BODY_R;
function segDist(p, a, b){ const e=sub(b,a), l2=dot(e,e)||1, t=clamp(dot(sub(p,a),e)/l2,0,1); return len(sub(p,add(a,mul(e,t)))); }
function conflicts(R){
  const by=Object.fromEntries(R.flows.map(f=>[f.key,f]));
  return PAIRS.map(P=>{
    const A=by[P.a], B=by[P.b]; if(!A || !B || !A.complete || !B.complete) return {...P, ok:false, len:0, pts:[]};
    const segB=[]; B.legs.forEach(l=>{ if(l.ok) for(let i=1;i<l.path.length;i++) segB.push([l.path[i-1],l.path[i]]); });
    let m=0; const pts=[];
    A.legs.forEach(l=>{ if(!l.ok) return; for(let i=1;i<l.path.length;i++){ const a=l.path[i-1], b=l.path[i], d=len(sub(b,a)), n=Math.max(1,Math.ceil(d/100));
      for(let j=0;j<n;j++){ const p=add(a,mul(sub(b,a),(j+0.5)/n));
        if(segB.some(([u,v])=>segDist(p,u,v)<MEET)){ m+=d/n; if(j%3===0) pts.push(p); } } } });
    return {...P, ok:true, len:m, pts};
  }).sort((p,q)=>q.len-p.len || (p.label<q.label?-1:1));
}
// Verschieben und vergleichen: das Teil id an allen zulässigen Lagen,
// je Lage alle Abläufe neu (vollständige, ehrlich gezählt). Wandteile
// entlang ihrer Wand (Schritt ≥ 50 mm), freie Teile (Insel, Tisch) längs
// und quer ±1,5 m. Deterministisch: feste Schritte, Gleichstand → die
// Lage näher an der jetzigen, dann die kleinere.
function placeOk(E, K, L, t){
  const g=geom(E,K,t); if(!g || !polyInRoom(E,g.foot||g.poly)) return false;
  return !L.G.some(h=>h.it.id!==t.id && bandsMeet(g,h) && TL.convexOverlap(g.foot||g.poly, h.foot||h.poly, 1));
}
// Duplizieren eines freien Teils (Insel, Tisch): die Kopie n (neue id, damit das
// Original beim Überlappen zählt) steht daneben, in der eigenen Achse des Teils
// (Drehung, wie die Achsen von sweep), mit gap mm Luft zur Platte samt Überstand.
// Längs rechts, längs links, quer hinter, quer davor; genommen wird die erste Lage,
// die im Raum liegt, nichts überlappt (placeOk) und nicht vor einer Tür oder einem
// Fenster steht (Zone wie in check und fitsAt). -> {x, y} im Raumrahmen oder
// null, wenn nirgends Platz ist. Der Versatz in F statt in der Teilachse ließ die
// Kopie ganz aus dem Raum fallen.
function copySpot(E, K, L, n, gap){
  const g=KIND[n.kind].free && geom(E,K,n); if(!g) return null;
  gap=gap==null ? 200 : gap;
  const zones=E.openings.map(o=>openingZone(E,o)).filter(Boolean);
  const P=g.foot||g.poly, span=ax=>{ const v=P.map(p=>dot(p,ax)); return Math.max(...v)-Math.min(...v); };
  const r=(n.rot||0)*Math.PI/180, u={x:Math.cos(r), y:Math.sin(r)}, v={x:-Math.sin(r), y:Math.cos(r)};
  for(const [d,s] of [[u,span(g.u)],[mul(u,-1),span(g.u)],[v,span(g.n)],[mul(v,-1),span(g.n)]]){
    const t={...n, x:n.x+d.x*(s+gap), y:n.y+d.y*(s+gap)};
    if(placeOk(E,K,L,t) && !zones.some(z=>zoneHit(geom(E,K,t),z))) return {x:t.x, y:t.y};
  }
  return null;
}
// Duplizieren eines Wandteils (Strg/Cmd+D): wie das Einfügen (clipItem, placeOnWall) neben das
// Original. Ein Eckschrank über Eck / diagonal geht nur in eine freie rechtwinklige Innenecke mit
// Platz für den zweiten Schenkel: die andere Ecke der Wand zuerst (die eigene ist besetzt), sonst
// gibt es keinen Platz. Mitten an der Wand oder in einer schiefen Ecke stünde er sofort rot.
// -> die Kopie (neue id, an der Wand des Originals) oder null.
function dupOnWall(E, K, L, it, id){
  const Wf=wallFrame(E,it.a,it.b); if(!Wf) return null;
  const n={...clipItem(it), id, a:it.a, b:it.b};
  if(n.corner && n.ctype){
    const e0=it.cEnd!=null ? it.cEnd : (it.x<=Wf.L-it.x-it.w ? 0 : 1);
    for(const e of [1-e0, e0]){
      const c={...n, cEnd:e}, x=cornerPlace(E,K,L,c,Wf);
      if(x==null || !fitsAt(E,K,L,c,Wf,x)) continue;
      // Schiefe Ecke oder Reflexecke: kein zweiter Schenkel, fitsAt prüft dann nur den Korpus und check wäre rot.
      const g=geom(E,K,{...c, x});
      if(!g || !cornerWing(E,K,g)) continue;
      c.x=x; return c;
    }
    return null;
  }
  const sl=placeOnWall(E,K,L,n,Wf,it.x+it.w,false);
  if(!sl) return null;
  n.x=sl.x; return n;
}
function sweep(E, K, L, id, opts){
  opts=opts||{};
  const it=K.items.find(x=>x.id===id); if(!it || it.corner) return null;
  const evalAt=t=>{ const K2={...K, items:K.items.map(x=>x.id===id?t:x)}, L2=layout(E,K2), R=flows(E,K2,L2,opts.extra?{planner:planner(E,L2,opts.extra)}:undefined);
    const by={}; Object.keys(GROUPS).forEach(k=>{ by[k]=R.flows.filter(f=>f.group===k && f.complete).reduce((a,f)=>a+f.week,0)*52/1e6; });
    // Prüfung mitrechnen (≈ 0,5 ms): das Optimum darf keine neuen Befunde
    // bringen (Tisch ohne Stuhlraum, Herd unter dem Fenster, Gang zu eng …).
    const F=check(E,K2,L2);
    return {km:R.kmYear, by, complete:R.complete, blocked:R.flows.reduce((a,f)=>a+f.blocked,0),
            bad:F.filter(f=>f.lvl==='bad').length, warn:F.filter(f=>f.lvl==='warn').length}; };
  const now=evalAt(it);
  const fine=p=>p.complete>=now.complete && p.blocked<=now.blocked && p.bad<=now.bad && p.warn<=now.warn;
  const axes=[];
  if(!KIND[it.kind].free){
    const Wf=wallFrame(E,it.a,it.b); if(!Wf) return null;
    const step=Math.max(50, Math.ceil(Wf.L/60/10)*10), pts=[];
    for(let x=0; x<=Wf.L-it.w+0.5; x+=step) if(fitsAt(E,K,L,it,Wf,x)) pts.push({v:x, ...evalAt({...it,x})});
    if(!pts.some(p=>Math.abs(p.v-it.x)<1)) pts.push({v:it.x, ...now});
    pts.sort((p,q)=>p.v-q.v);
    axes.push({key:'wall', label:'Lage an der Wand', cur:it.x, pts});
  } else if(E.F){
    const r=(it.rot||0)*Math.PI/180, dirs=[['u','längs',{x:Math.cos(r),y:Math.sin(r)}],['n','quer',{x:-Math.sin(r),y:Math.cos(r)}]];
    dirs.forEach(([k,lab,d])=>{ const pts=[];
      for(let o=-1500;o<=1500;o+=100){ const t={...it, x:it.x+d.x*o, y:it.y+d.y*o}; if(o===0) pts.push({v:0, ...now}); else if(placeOk(E,K,L,t)) pts.push({v:o, ...evalAt(t)}); }
      axes.push({key:k, label:`Verschieben ${lab}`, cur:0, pts, dir:d}); });
  }
  // Gesperrte Wege zählen nicht in die Meter – eine Lage, die einen Weg
  // versperrt, sähe sonst kürzer aus. In Frage kommen nur Lagen, die
  // gegenüber jetzt nichts verschlechtern: nicht weniger vollständige
  // Abläufe, nicht mehr gesperrte Wege, keine neuen roten oder gelben Befunde.
  axes.forEach(a=>{ a.pts.forEach(p=>{ p.ok=fine(p); });
    const ok=a.pts.filter(p=>p.ok);
    a.best=ok.slice().sort((p,q)=>p.km-q.km || Math.abs(p.v-a.cur)-Math.abs(q.v-a.cur) || p.v-q.v)[0]||null; });
  // In einer vollen Zeile ist kaum Platz zum Schieben: Plätze tauschen mit
  // gleich breiten Teilen derselben Bauart (beide an die Stelle des anderen).
  const swaps=[];
  if(!KIND[it.kind].free){
    const base=now;
    K.items.filter(o=>o.id!==id && !o.corner && o.kind===it.kind && o.w===it.w && o.a && !fzOf(o) && !fzOf(it)).forEach(o=>{
      const t={...it, a:o.a, b:o.b, x:o.x}, u={...o, a:it.a, b:it.b, x:it.x};
      const K2={...K, items:K.items.map(x=>x.id===id?t:x.id===o.id?u:x)}, L2=layout(E,K2), R=flows(E,K2,L2,opts.extra?{planner:planner(E,L2,opts.extra)}:undefined);
      const F=check(E,K2,L2);
      swaps.push({with:o.id, km:R.kmYear, d:R.kmYear-base.km, complete:R.complete, blocked:R.flows.reduce((a,f)=>a+f.blocked,0),
                  bad:F.filter(f=>f.lvl==='bad').length, warn:F.filter(f=>f.lvl==='warn').length});
    });
    swaps.forEach(x=>{ x.ok=fine(x); });
    swaps.sort((p,q)=>(q.ok-p.ok) || p.km-q.km || p.with-q.with);
  }
  return {id, axes, swaps};
}
// Lücken der km/Jahr-Kurve (gesperrte Lagen): br[i] = vor Punkt i bricht die Linie ab.
// Das Raster kennt nur sweep; die jetzige Lage cur liegt meist daneben (Wand 4000:
// 70-mm-Raster, Teil bei 600) und darf den Rasterschritt nicht stellen - als
// kleinster Abstand aller Punkte machte sie fast jedes Stück zur „Lücke“. Der
// Schritt ist der kleinste Abstand zweier Punkte ohne cur; gebrochen wird, wo mehr
// als ein Schritt dazwischen liegt, dort fehlt eine Rasterlage.
function sweepGaps(P, cur){
  const sp=P.slice(1).map((p,i)=>({d:p.v-P[i].v, c:Math.abs(p.v-cur)<1 || Math.abs(P[i].v-cur)<1}));
  const grid=sp.filter(s=>!s.c).map(s=>s.d), step=Math.min(...(grid.length ? grid : sp.map(s=>s.d)));
  return P.map((p,i)=>i>0 && p.v-P[i-1].v>step+0.5);
}

// Texte in Hinweisen und Panel. Listen mit „ · “: Inhaltsnamen enthalten selbst
// Kommas („Messer, Bretter“), ein Komma als Trenner wäre mehrdeutig.
const roleList=keys=>keys.map(k=>ROLE_LABEL[k]||k).join(' · ');
// Rückgängig-Zusatz hinter einer Aussage, die eine „ · “-Liste enthalten kann:
// als eigener Satz, sonst liest sich „⌘Z nimmt es zurück“ wie ein Listenelement.
const undoHint=t=>t+'. ⌘Z nimmt es zurück';
// Einheiten im Plan: Schrankbreiten stehen als Nennmaß in cm (Typenliste, wie im
// Panel), Maßkette und Abstände in mm (so bearbeitet man den Wandabstand). Die
// globale Einheit (m/cm/mm) gilt für die Messeingaben des Grundrisses, nicht für Bauteile.
const DIM_NOTE='Maße in mm · Schrankbreite in cm';
// Bedienzustand der Küche aus einer Meldung (Meldedialog: zustand und Nachstellen).
// Eine Meldung ist eine Fremddatei: nur gültige Werte kommen durch, der Rest bleibt
// Standard. sel muss ein Teil von K sein, flow ein Ablauf; ref (Referenz der
// Analyse) trägt km/Jahr und je Ablauf Woche und Meter. Die Schalter ana/paths/
// show3d nur, wenn sie Wahrheitswerte sind (sonst bleibt, was die Sitzung hat).
function normUi(o, K){
  const r={sel:null, open:false, flow:null, anaMode:'week', kid:false, heat:true, ref:null};
  if(!o || typeof o!=='object') return r;
  if(Number.isInteger(o.sel) && K && K.items.some(it=>it.id===o.sel)) r.sel=o.sel;
  r.open=o.open===true;
  if(FLOWS.some(f=>f.key===o.flow)) r.flow=o.flow;
  if(o.anaMode==='run') r.anaMode='run';
  r.kid=o.kid===true; r.heat=o.heat!==false;
  ['ana','paths','show3d'].forEach(k=>{ if(typeof o[k]==='boolean') r[k]=o[k]; });
  const rf=o.ref && o.ref.flows;
  if(rf && typeof rf==='object' && fin(o.ref.kmYear)){
    const fl={}; FLOWS.forEach(f=>{ const x=rf[f.key]; if(x && fin(x.week) && fin(x.m)) fl[f.key]={week:x.week, m:x.m}; });
    r.ref={kmYear:o.ref.kmYear, flows:fl};
  }
  return r;
}

// ---------- 3D-Szene ----------
// Alles sind Prismen: konvexes Grundriss-Polygon von z0 bis z1, Farbe,
// Kennung. Die UI legt daraus Dreiecke und Kanten.
const COL={ carcass:[0.93,0.92,0.89], front:[0.97,0.96,0.93], plinth:[0.35,0.34,0.32], top:[0.62,0.50,0.36],
            wallCab:[0.95,0.94,0.91], dark:[0.16,0.16,0.17], steel:[0.72,0.73,0.75], glass:[0.70,0.82,0.90],
            fridge:[0.96,0.97,0.98], table:[0.70,0.56,0.40], bad:[0.86,0.25,0.20], sel:[0.18,0.45,0.85], floor:[0.86,0.84,0.79], wallFace:[0.97,0.96,0.94] };
function rect(Wf, s0, s1, q0, q1){ return [wpt(Wf,s0,q0), wpt(Wf,s1,q0), wpt(Wf,s1,q1), wpt(Wf,s0,q1)]; }
function frameRect(g, a0, a1, b0, b1){
  // Rechteck im Teil-Rahmen: a entlang der Front (0..w), b ab Rückseite (0..d)
  if(!g.free) return rect(g.Wf, g.s0+a0, g.s0+a1, b0, b1);
  const o=add(add(g.c, mul(g.u,-g.it.w/2)), mul(g.n,-g.d/2));
  const at=(a,b)=>add(add(o,mul(g.u,a)),mul(g.n,b));
  return [at(a0,b0),at(a1,b0),at(a1,b1),at(a0,b1)];
}
function scene(E, K, L, opts){
  opts=opts||{};
  const S=K.spec, D=L.D, prisms=[], bad=opts.bad||new Set(), warn=opts.warn||new Set(), sel=opts.sel||new Set(), open=!!opts.open;
  const P_=(poly,z0,z1,col,id,edge=true)=>prisms.push({poly,z0,z1,col,id,edge});
  L.G.forEach(g=>{
    const it=g.it, w=it.w, d=g.d, id=it.id;
    // Auswahl vor Befund: ein angeklicktes rotes Teil muss auffindbar sein.
    const tint=c=>sel.has(id) ? mix(c,COL.sel,0.35) : bad.has(id) ? mix(c,COL.bad,0.45) : warn.has(id) ? mix(c,[0.95,0.70,0.15],0.3) : c;
    // „Fronten offen“: die Hüllen (openPlates) öffnen ihre Fronten, was keine
    // Hülle öffnet (zu), bleibt als geschlossene Front stehen.
    const shut=fr=>open && g.env.length ? fr.filter(f=>f.zu) : fr;
    // Zweiter Schenkel eines Eckschranks über Eck: Korpus, Sockel und Tür
    // (offen zeigt das Hauptteil beide Türen). Diagonal: das Fünfeck am
    // Hauptteil deckt ihn ganz.
    if(g.wing){
      if(it.ctype==='diag') return;
      const a0=g.vs0-g.s0, a1=g.vs1-g.s0, lo=it.kind==='wall', zb=lo ? g.z0 : S.plinth, zt=lo ? g.z1 : D.workH-S.topT;
      if(!lo) P_(frameRect(g,a0,a1,0,d-19-50), 0, S.plinth, COL.plinth, id, false);
      P_(frameRect(g,a0,a1,0,d-19), zb, zt, tint(lo?COL.wallCab:COL.carcass), id);
      if(!(open && g.main.env.length)) P_(frameRect(g,a0+1.5,a1-1.5,d-19,d), zb+1.5, zt-1.5, tint(COL.front), id);
      return;
    }
    // Diagonal-Eckschrank: Korpus als Fünfeck (Front 19 mm hinter der Schräge).
    const body=dd=>{
      if(!(it.ctype==='diag' && g.wingG)) return frameRect(g,0,w,0,dd);
      // Schräge x+y=w+d um (d−dd) zurückgesetzt
      const at=g.wingG.at, k=d-(d-dd)*Math.SQRT2;
      return [at(0,0), at(w,0), at(w,k), at(k,w), at(0,w)]; };
    if(it.kind==='table'){
      const top=g.z1;
      P_(frameRect(g,0,w,0,d), top-30, top, tint(COL.table), id);
      [[40,40],[w-80,40],[w-80,d-80],[40,d-80]].forEach(([a,b])=>P_(frameRect(g,a,a+40,b,b+40),0,top-30,tint(COL.table),id));
      return;
    }
    const front=19, carcD=d-front;
    if(it.kind==='base'||it.kind==='island'){
      // Insel mit eigener Höhe: Platte auf ihrer Oberkante, nicht auf der Küchen-Arbeitshöhe.
      const wt = it.kind==='island' ? g.z1 : D.workH, tz=wt-S.topT;
      if(it.kind==='base') P_(body(carcD-50), 0, S.plinth, COL.plinth, id, false);
      else P_(frameRect(g,50,w-50,50,d-50), 0, S.plinth, COL.plinth, id, false);
      P_(body(carcD), S.plinth, tz, tint(COL.carcass), id);
      if(open && g.env.length) openPlates(g).forEach(f=>P_(f.poly, f.z0, f.z1, tint(f.col||COL.front), id));
      shut(frontsOf(g, S.plinth, tz, D, S)).forEach(f=>P_(f.poly, f.z0, f.z1, tint(it.dev==='dw'||it.dev==='hob'&&f.oven?COL.steel:COL.front), id));
      // Gemeinsame Platte mehrerer Inseln: je Insel ihr Stück, Kanten nur am
      // Umriss (am ersten Stück), damit zwischen den Stücken keine Fuge zu sehen ist.
      const jt = it.kind==='island' && L.tops.find(t=>t.joined && t.ids.includes(id));
      // Eine Farbe für die ganze gemeinsame Platte (Auswahl vor rot vor gelb).
      const jtint=c=>jt.ids.some(i=>sel.has(i)) ? mix(c,COL.sel,0.35) : jt.ids.some(i=>bad.has(i)) ? mix(c,COL.bad,0.45) : jt.ids.some(i=>warn.has(i)) ? mix(c,[0.95,0.70,0.15],0.3) : c;
      if(it.kind==='island') P_(g.foot||g.poly, tz, wt, jt ? jtint(COL.top) : tint(COL.top), id, jt ? (jt.ids[0]===id ? jt.edges : []) : true);
      if(it.dev==='sink'){
        P_(frameRect(g, 60, w-60, 90, d-90), wt, wt+2, COL.steel, id);
        const fp=faucetPoint(K,g), fh=it.faucetH!=null?it.faucetH:S.faucetH, r=18;
        P_([{x:fp.x-r,y:fp.y-r},{x:fp.x+r,y:fp.y-r},{x:fp.x+r,y:fp.y+r},{x:fp.x-r,y:fp.y+r}], wt, wt+fh, COL.steel, id);
      }
      if(it.dev==='hob') P_(frameRect(g, 40, w-40, 60, d-60), wt, wt+5, COL.dark, id);
    } else if(it.kind==='wall'){
      P_(body(carcD), g.z0, g.z1, tint(COL.wallCab), id);
      if(it.dev==='hood') P_(frameRect(g,10,w-10,10,d-10), g.z0-2, g.z0+30, COL.dark, id);
      if(open && g.env.length) openPlates(g).forEach(f=>P_(f.poly, f.z0, f.z1, tint(COL.front), id));
      shut(frontsOf(g, g.z0, g.z1, D, S)).forEach(f=>P_(f.poly, f.z0, f.z1, tint(COL.front), id));
    } else if(fzOf(it)){
      // Frei stehender Kühlschrank: Korpus ohne Sockel, Flügel so dick wie eingestellt.
      P_(frameRect(g,0,w,0,d-doorTOf(it)), 10, g.z1, tint(COL.fridge), id);
      if(open && g.env.length) openPlates(g).forEach(f=>P_(f.poly, f.z0, f.z1, tint(f.col||COL.fridge), id));
      shut(frontsOf(g, 10, g.z1, D, S)).forEach(f=>P_(f.poly, f.z0, f.z1, tint(COL.fridge), id));
    } else if(it.kind==='tall'){
      P_(frameRect(g,0,w,0,carcD-50), 0, S.plinth, COL.plinth, id, false);
      P_(frameRect(g,0,w,0,carcD), S.plinth, g.z1, tint(isCold(it)?COL.fridge:COL.carcass), id);
      if(open && g.env.length) openPlates(g).forEach(f=>P_(f.poly, f.z0, f.z1, tint(f.col||(isCold(it)?COL.fridge:COL.front)), id));
      shut(frontsOf(g, S.plinth, g.z1, D, S)).forEach(f=>P_(f.poly, f.z0, f.z1, tint(f.oven?COL.dark:f.dw?COL.steel:isCold(it)?COL.fridge:COL.front), id));
    }
  });
  L.tops.filter(t=>!t.island).forEach(t=>P_(t.poly, t.z0, t.z1, COL.top, null));
  // Fenster: Glas in der Öffnung, offen als gedrehter Flügel.
  const glass=[];
  E.openings.filter(o=>o.kind==='window').forEach(o=>{
    const Wf=wallFrame(E,o.a,o.b), on=Wf&&openingOn(E,o,Wf); if(!on) return;
    const sa=open ? sashes(E,o) : [];
    if(sa.length) sa.forEach(s=>glass.push({quad:[s.h, add(s.h, mul(s.n, s.r))], z0:on.z0, z1:on.z1, open:true}));
    else glass.push({quad:[wpt(Wf,on.s0,-30), wpt(Wf,on.s1,-30)], z0:on.z0, z1:on.z1});
  });
  return {prisms, glass};
}
// Wandinnenflächen für 3D: je Wand Streifen zwischen den Öffnungskanten,
// darin Boden bis Decke minus Öffnungen. Normale zeigt in den Raum (die UI
// blendet Wände aus, auf deren Rückseite man schaut). Dazu oben ein
// Kantenstreifen (Wanddicke angedeutet), damit Wände nicht papierdünn wirken.
function wallFaces(E, thick=120){
  const quads=[], caps=[];
  E.wallsByKey.forEach(W=>{
    const Wf=wallFrame(E, W.a, W.b); if(!Wf) return;
    const ops=E.openings.map(o=>openingOn(E,o,Wf)).filter(Boolean)
      .map(on=>({...on, s0:clamp(on.s0,0,Wf.L), s1:clamp(on.s1,0,Wf.L)})).filter(on=>on.s1-on.s0>1);
    // Knicke der Oberkante (Giebel, Kniestock) schneiden die Streifen wie die
    // Öffnungskanten: dazwischen läuft die Decke gerade, ceilAt gibt die Enden.
    const kx=ceilShape(E,Wf.a,Wf.b).knicks.map(k=>k.x);
    const cuts=[...new Set([0, Wf.L, ...kx, ...ops.flatMap(o=>[o.s0,o.s1])])].sort((p,q)=>p-q);
    for(let i=0;i<cuts.length-1;i++){
      const s0=cuts[i], s1=cuts[i+1]; if(s1-s0<1) continue;
      const sm=(s0+s1)/2, here=ops.filter(o=>o.s0<=sm && sm<=o.s1).sort((p,q)=>p.z0-q.z0);
      const top0=ceilAt(E,Wf,s0), top1=ceilAt(E,Wf,s1);
      let z=0;
      const span=(za,zb0,zb1)=>{ quads.push({a:wpt(Wf,s0,0), b:wpt(Wf,s1,0), z0a:za, z0b:za, z1a:zb0, z1b:zb1, n:Wf.n}); };
      here.forEach(o=>{ if(o.z0>z+1) span(z, Math.min(o.z0,top0), Math.min(o.z0,top1)); z=Math.max(z,o.z1); });
      if(z<Math.min(top0,top1)-1) quads.push({a:wpt(Wf,s0,0), b:wpt(Wf,s1,0), z0a:z, z0b:z, z1a:top0, z1b:top1, n:Wf.n});
    }
    // Wand-Inseln (Säulen, freie Wandstücke) bekommen statt der Streifen
    // einen vollen Deckel (tops), sonst schaut man von oben durch das hohle
    // Innere auf das, was dahinter steht: die Flächen sind einseitig.
    // Der Kantenstreifen folgt der Oberkante: je Stück zwischen zwei Knicken
    // eine Schräge von za nach zb.
    if(!W.hole){
      const ks=[0, ...kx, Wf.L];
      for(let i=0;i<ks.length-1;i++){
        const s0=ks[i], s1=ks[i+1];
        caps.push({poly:[wpt(Wf,s0,0), wpt(Wf,s1,0), wpt(Wf,s1,-thick), wpt(Wf,s0,-thick)], za:ceilAt(E,Wf,s0), zb:ceilAt(E,Wf,s1)});
      }
    }
  });
  // Deckel der Wand-Inseln: Höhe je Ecke und je Knick aus derselben Deckenform
  // wie die Wände (die Ecke ist ha der Wand, die dort beginnt).
  const tops=TL.ringsOf(E.ring).slice(1).map(R=>R.flatMap((p,i)=>{
    const q=R[(i+1)%R.length], sh=ceilShape(E,p.id,q.id), Wf=wallFrame(E,p.id,q.id);
    return [{x:p.x, y:p.y, z:sh.ha}, ...(Wf ? sh.knicks.map(k=>{ const w=wpt(Wf,k.x,0); return {x:w.x, y:w.y, z:k.y}; }) : [])];
  }));
  return {quads, caps, tops};
}
// Fronten eines Teils als dünne Platten (geschlossen oder offen).
// zu: bleibt in „Fronten offen“ geschlossen, weil keine Prüfhülle sie öffnet
// (untere Laden, Lade unter dem Backofen, Blende zur Ecke). Alles andere ersetzt
// scene dort durch die Hüllen (openPlates).
function frontsOf(g, z0, z1, D, S){
  const it=g.it, w=it.w, d=g.d, out=[], t=19, gap=3;
  const plate=(a0,a1,zz0,zz1,extra)=>out.push({poly:frameRect(g, a0+gap/2, a1-gap/2, d-t, d), z0:zz0+gap/2, z1:zz1-gap/2, ...extra});
  const fk=frontKind(it), fz=fzOf(it);
  if(fz){
    // Flügel in Türdicke; French Door mit Schubladen darunter.
    const T=doorTOf(it), wl=w*(fz.split||1), zl=it.fz==='fd' ? Math.min(fz.drawerZ, z1-300) : z0;
    const leaf=(a0,a1,zz0,zz1,extra)=>out.push({poly:frameRect(g, a0+gap/2, a1-gap/2, d-T, d), z0:zz0+gap/2, z1:zz1-gap/2, ...extra});
    if(fz.single){ const zg=Math.min(fz.gfZ, z1-400); if(it.gf){ leaf(0,w,z0,zg); leaf(0,w,zg,z1); } else leaf(0,w,z0,z1); return out; }
    leaf(0,wl,zl,z1); leaf(wl,w,zl,z1);
    if(it.fz==='fd'){ const zm=z0+(zl-z0)*FD_LOW; leaf(0,w,z0,zm,{zu:true}); leaf(0,w,zm,zl); }
    return out;
  }
  if(ovenBelow(it)){
    // Ofentür ab ovenZ (wie die Hülle), darunter die flache Lade.
    const zo=ovenZ(z0,z1);
    plate(0,w,z0,zo,{zu:true});
    plate(0,w,zo,z1,{oven:true});
    return out;
  }
  if(tallDev(it)){
    // Hochschrank mit Gerät (hohe Spülmaschine, Backofen, Mikrowelle):
    // Gerätefront zwischen zwei Schranktüren, Höhen aus devSegs wie die
    // Prüfhüllen. Ist der Schrank niedriger als das Gerät, keine verkehrte
    // Platte zeichnen (check meldet ihn als zu niedrig).
    const sg=devSegs(it,S), zd=Math.max(z0, sg.zd), zt=Math.max(zd, sg.zt), col=it.dev==='dw' ? {dw:true} : {oven:true};
    if(zd-z0>gap) plate(0,w,z0,zd); if(zt-zd>gap) plate(0,w,zd,zt,col); if(z1-zt>gap) plate(0,w,zt,z1);
    return out;
  }
  // Über Eck: am Hauptteil nur der freie Teil der Front (der Rest steht
  // hinter dem zweiten Schenkel, dessen Tür zeichnet scene). Diagonal: Tür
  // auf der Schräge.
  if(shapeOf(it) && g.wingG && fk==='door'){
    const at=g.wingG.at;
    if(it.ctype==='diag'){ const P1=at(w,d), P2=at(d,w), b=mul(g.cornerOut,-t);
      out.push({poly:[add(P1,b), add(P2,b), P2, P1], z0:z0+gap/2, z1:z1-gap/2}); }
    else { const atS0=cornerAtS0(g); plate(atS0?d:0, atS0?w:w-d, z0, z1); }
    return out;
  }
  const cb=S && !g.free ? cornerBlind(g,S) : null;
  if(cb && fk==='door'){
    // Halbeckschrank: Blende zur Ecke, eine Tür auf dem freien Teil
    // (mit Schubkasten: Schubkastenfront oben über der Tür, Blende durchgehend).
    const [f0,f1] = cb.atS0 ? [cb.b,w] : [0,w-cb.b];
    plate(cb.atS0?0:w-cb.b, cb.atS0?cb.b:w, z0, z1, {blind:true, zu:true});
    if(it.inner==='schub' && it.kind==='base'){ const zd=z1-(z1-z0)*DRAWER_TOP; plate(f0,f1,zd,z1); plate(f0,f1,z0,zd); }
    else plate(f0,f1,z0,z1);
    return out;
  }
  if(it.dev==='hood'){ plate(0,w,z0,z1); return out; }
  if(fk==='drawer'){
    // Unten zwei hohe, oben die flache Lade; die Prüfhülle (Auszug) zieht nur
    // die oberste, die übrigen bleiben zu.
    const hs=[(1-DRAWER_TOP)/2, (1-DRAWER_TOP)/2, DRAWER_TOP]; let z=z0;
    hs.forEach((h,i)=>{ const z2=z+(z1-z0)*h; plate(0,w,z,z2, i<hs.length-1 ? {zu:true} : undefined); z=z2; });
  } else if(fk==='door' && w>600 && !isCold(it)){ plate(0,w/2,z0,z1); plate(w/2,w,z0,z1); }
  else if(fk==='slide'){ plate(0,w*0.55,z0,z1); out.push({poly:frameRect(g,w*0.45,w,d-2*t-2,d-t-2), z0:z0+2, z1:z1-2}); }
  else if(fk!=='open') plate(0,w,z0,z1);
  return out;
}
const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
// Offene Fronten für die 3D-Ansicht: Tür 90° auf, Auszug gezogen, Geräte-
// klappe waagerecht. Zeigt dieselben Hüllen, die die Prüfung benutzt.
function openPlates(g){
  const out=[], t=19;
  g.env.forEach(e=>{
    if(e.open90) out.push({poly:e.open90, z0:e.z0, z1:e.z1});
    else if(e.what==='Tür' || e.what==='Mikrowellentür'){
      // Im gewählten Winkel (90° oder 120°); die Dicke zur geschlossenen Seite.
      const th=(e.deg||90)*Math.PI/180, dv=add(mul(e.along,Math.cos(th)), mul(e.n,Math.sin(th))), pv=sub(mul(e.along,Math.sin(th)), mul(e.n,Math.cos(th)));
      const tip=add(e.hinge, mul(dv, e.r));
      out.push({poly:[e.hinge, tip, add(tip,mul(pv,t)), add(e.hinge,mul(pv,t))], z0:e.z0, z1:e.z1, col:e.dev==='mw'?COL.dark:undefined});
    } else if(e.what==='Auszug'){
      // Gezogen wird die Lade ab zp (die oberste Front des Stapels, so hoch
      // wie ihre geschlossene Front); ohne zp füllt sie die ganze Hülle.
      const zm=e.zp!=null ? e.zp : e.z0;
      out.push({poly:[add(e.pl,mul(e.n,e.t-t)), add(e.pr,mul(e.n,e.t-t)), add(e.pr,mul(e.n,e.t)), add(e.pl,mul(e.n,e.t))], z0:zm, z1:e.z1});
      out.push({poly:[e.pl, e.pr, add(e.pr,mul(e.n,e.t-t)), add(e.pl,mul(e.n,e.t-t))], z0:zm, z1:zm+(e.z1-zm)*0.6, col:COL.carcass});
    } else out.push({poly:e.poly, z0:e.z0, z1:e.z0+20, col:e.dev==='dw'?COL.steel:COL.dark});
  });
  return out;
}

// ---------- Stückliste ----------
function stock(K, L){
  const rows=new Map();
  // Eckschränke mit Typ und Innenleben (UE100-50 · Schubkasten + Tür).
  const extraOf=it=>{ if(!it.corner || !CORNER[it.kind]) return '';
    const sh=shapeOf(it); if(sh) return [cornerType(it), it.ctype==='diag'?'Diagonal':'über Eck', it.inner==='karussell'?'Karussell':''].filter(Boolean).join(' · ');
    const cb=cornerBlind(L.byId.get(it.id)||{it}, K.spec);
    return [cornerType(it) || (cb ? `Tür ${Math.round((it.w-cb.b)/10)} cm` : ''), it.kind==='base' ? CORNER.base.inner[it.inner||'boden'] : ''].filter(Boolean).join(' · '); };
  // Bestellmerkmale: eine Zeile fasst nur Teile zusammen, die sich gleich
  // bestellen. Der Text nennt, was sie unterscheidet, und ist zugleich der
  // Schlüssel – zwei Zeilen sehen also nie gleich aus. Front, wo man sie
  // wählt (wie im Panel; beim Eckschrank steckt die Tür im Typ), Höhe und
  // Tiefe als Abweichung vom Standard (wie dimSpec), Insel bei Geräten.
  // Werte wie sie gelten (frontKind, dims): ausdrücklich gesetzter Standard
  // zählt wie keine Angabe. Türanschlag, wo er wählbar ist (hasHinge):
  // rechts steht im Text, Standard links nicht – getrennt gezählt wird so
  // trotzdem.
  const cm=v=>String(Math.round(v)/10).replace('.',',');
  const detailOf=it=>{
    const fk=frontKind(it), cur=dims(K,it), std=dims(K,{...it, d:undefined, h:undefined, z:undefined});
    const choose=fk && fk!=='flapdown' && !isCold(it) && it.dev!=='mw' && !(it.corner && fk==='door');
    return [it.dev && it.kind==='island' ? 'Insel' : '',
            choose ? FRONTS[fk] : '',
            hasHinge(it) && it.hinge==='right' ? 'Anschlag rechts' : '',
            Math.abs((cur.z1-cur.z0)-(std.z1-std.z0))>0.5 ? `H ${cm(cur.z1-cur.z0)}` : '',
            Math.abs(cur.d-std.d)>0.5 ? `T ${cm(cur.d)}` : '',
            it.water ? 'Festwasser' : '',
            extraOf(it)].filter(Boolean);
  };
  L.G.forEach(g=>{ const it=g.it; if(it.kind==='table' || g.wing) return;
    const name=nameOf(it), text=[`${name} cm`, ...detailOf(it)].join(' · '), k=`${it.kind}|${text}`;
    const r=rows.get(k); if(r) r.n++; else rows.set(k, {name, extra:extraOf(it), text, n:1}); });
  const list=[...rows.values()].sort((p,q)=>p.name.localeCompare(q.name,'de') || p.text.localeCompare(q.text,'de'));
  // Inselplatten mit (Meldung M-20261109-145755-b3f684), Tiefe samt Tresen-Überstand.
  const tops=[...L.tops.filter(t=>!t.island && !t.patch).map(t=>({len:t.len, depth:t.depth})),
              ...L.tops.filter(t=>t.island).map(t=>({len:t.len, depth:t.depth, island:true}))];
  return {list, tops, topSum:tops.reduce((s,t)=>s+t.len,0), fillers:(L.fillers||[]).map(f=>({w:f.w, corner:!!f.corner}))};
}

// Darf dieser Schrank Inhalte tragen, und welche? S (Küchenmaße) brauchen
// nur Hochschränke mit Gerät: welche Fächer es neben dem Gerät gibt.
function storable(it, S){
  if(it.kind==='table') return [];
  if(tallDev(it)){
    // Fächer über und unter dem Gerät hinter Türen: kein Müll (der gehört
    // an die Spüle), kein Besteck und keine Messer (nur in Schubladen).
    // Was in kein Fach darf (niedriges Fach unten, oben keins), fällt weg.
    const Z=devZones(it,S); if(!Z.length) return [];
    return CONTENTS.filter(c=>!c.fixed && !['muell','besteck','messer'].includes(c.key)
      && Z.some(z=>!z.only || z.only.includes(c.key))).map(c=>c.key);
  }
  if(['dw','fridge','freezer','oven','mw','hood'].includes(it.dev) || ovenBelow(it)) return [];
  if(it.dev==='sink') return ['muell','putz'];
  return CONTENTS.filter(c=>!c.fixed && !(c.low && it.kind==='wall') && !(c.key==='muell' && it.kind!=='base' && it.kind!=='island')).map(c=>c.key);
}
// ---------- Plan-Etiketten (Bildschirmraum) ----------
// Meldungen: „120“ über „Besteck“ (gedrehte Insel), „Eck 90“ über dem Inhalt
// und aus dem Korpus heraus, zwei „90“ übereinander (Kochfeld + Dunstabzug).
// Früher lagen Breite und Inhalt in der WELT entlang der Normale versetzt,
// der Text läuft aber immer waagerecht. Jetzt: Breite (+ Gerätekürzel) und
// Inhalt als zweizeiliger Block um den Schwerpunkt, im Bildschirm gemessen;
// was nicht ins Teil passt, wird gestuft gekürzt oder entfällt. Vorrang:
// Unter-/Hochschrank-Breite (mit Kürzel) > Hängeschrank > Inhalt > Stationen.
// DOM-frei: toScr und measure(txt, font) → Gerätepixel kommen von der UI.
// Schriftgrößen in CSS-px (× dpr), alle Küchen-Plan-Schriften ≥ 11 px; die
// Tinte hat ≥ 4,5:1 auf Unterschrank, Hochschrank und Platte.
const PLAN_TXT={ main:12, sub:11, ink:'#4b473e' };
const devTag=it=>fzOf(it) ? ({fd:'FD', sbs:'SbS'}[it.fz] || (it.dev==='freezer'?'TK':it.gf?'KG':'KS'))
  : ({dw:'GS', fridge:'KS', freezer:'TK', oven:'BO', mw:'MW'}[it.dev] || '');
// Nennmaß in cm: Eck-Hängeschrank mit Korpus 782 heißt „80“ wie Panel und Typ.
const nomCm=it=>{ const C=it.corner && CORNER[it.kind]; return String((C && C.nominal || {})[Math.round(it.w)] || Math.round(it.w/10)); };
// Inhalt gestuft, jede Stufe eine Liste von Zeilen (Wunsch: erst umbrechen,
// dann kürzen): je Inhalt eine Zeile mit voller Bezeichnung → je Inhalt das
// erste Wort → weniger Zeilen, die letzte mit „+n“ → eine Zeile „A · B +n“ →
// „A +n“ → nur „+n“. Eigene Zeile bzw. „ · “ statt Komma, weil die
// Bezeichnungen selbst Kommas tragen („Töpfe, Pfannen“). Bei genau einem
// Inhalt kein bloßes „+1“ (liest sich als „einer mehr“, Gegenprüfung): passt
// das Wort nicht, entfällt die Zeile.
function contentCands(it){
  const full=(it.store||[]).filter(k=>k!=='kuehl').map(k=>CLABEL[k]||k), n=full.length;
  if(!n) return [];
  const names=full.map(t=>t.split(/[ ,]/)[0]), out=[full, names];
  for(let k=n-1; k>=2; k--) out.push([...names.slice(0,k-1), `${names[k-1]} +${n-k}`]);
  if(n>=2) out.push([names.slice(0,2).join(' · ')+(n>2?` +${n-2}`:'')], [`${names[0]} +${n-1}`], [`+${n}`]);
  return out.filter((ls,i)=>out.findIndex(m=>m.join('\n')===ls.join('\n'))===i);
}
// Kopfzeilen, lang → kurz; jede Variante ist eine Liste von Zeilen.
// Hängeschrank „H 60“, Dunstabzug „DA 90“; liegt er (bis 30 mm versetzt)
// deckungsgleich über einem Unterschrank, steht dessen Breite schon da – dann
// nur „H“/„DA“ statt eines zweiten „90“. Kürzel (Gerät, „Eck“) erst neben der
// Breite, dann darunter („60“/„GS“), erst zuletzt ohne: sonst fielen GS/KS im
// geteilten Bild weg, während der Nachbar noch „+2“ zeigt (Gegenprüfung).
function headCands(g, L){
  const it=g.it, w=nomCm(it);
  if(it.kind==='table') return [[`${w}×${Math.round(g.d/10)}`], [w]];
  if(it.kind==='wall'){
    const pre=it.dev==='hood' ? 'DA' : 'H';
    const same=L.G.some(h=>!h.wing && !h.free && h.it.kind==='base' && h.Wf.key===g.Wf.key && Math.abs(h.s0-g.s0)<=30 && Math.abs(h.s1-g.s1)<=30);
    return same ? [[pre]] : it.corner ? [[`${pre} Eck ${w}`], [`${pre} ${w}`], [pre]] : [[`${pre} ${w}`], [pre]];
  }
  const t=devTag(it), tag=[it.corner?'Eck':'', t].filter(Boolean).join(' ');
  if(!tag) return [[w]];
  return [[it.corner ? `Eck ${w}${t?' '+t:''}` : `${w} ${t}`], [w, tag], [w]];
}
// Rechteck ganz im Polygon: Ecken innen und keine Polygonecke im Rechteck –
// fängt den L-förmigen Eckschrank, bei dem die Hülle passen würde.
const rectIn=(r,P)=>[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]].every(([x,y])=>TL.pointInRing({x,y},P))
  && !P.some(p=>p.x>r.x && p.x<r.x+r.w && p.y>r.y && p.y<r.y+r.h);
const areaCentroid=P=>{ let a=0, x=0, y=0;
  P.forEach((p,i)=>{ const q=P[(i+1)%P.length], k=p.x*q.y-q.x*p.y; a+=k; x+=(p.x+q.x)*k; y+=(p.y+q.y)*k; });
  return Math.abs(a)<1e-9 ? centroid(P) : {x:x/(3*a), y:y/(3*a)}; };
// o={toScr, measure(txt, font), dpr, LP (CORE.labelPlacer mit Hindernissen)};
// font={px (Gerätepixel), weight, italic}. Liefert {labels:[{id, role
// 'head'|'tag'|'wall'|'sub', txt, font, x, y (Mitte), r (belegtes Rechteck)}], LP}.
function planLabels(L, o){
  const dpr=o.dpr||1, LP=o.LP||C.labelPlacer(), out=[], pend=[];
  const fH={px:PLAN_TXT.main*dpr, weight:600}, fS={px:PLAN_TXT.sub*dpr, weight:400}, fW={px:PLAN_TXT.sub*dpr, weight:600, italic:true};
  const fWS={...fS, italic:true};   // Inhalt eines Hängeschranks: kursiv wie sein „H“
  // Gestapeltes Kürzel („GS“ unter „60“) in Inhaltsgröße, fett: wo eine
  // Inhaltszeile passt, passt auch das Kürzel – es geht dem Inhalt vor.
  const fT={px:PLAN_TXT.sub*dpr, weight:600};
  const lh=f=>Math.round(f.px*1.25);
  // Rand je Seite 1,5 px: zwei Kästen, die sich berühren, lassen 3 px Luft.
  const pad=3*dpr, box=(t,f,x,y)=>{ const w=o.measure(t,f)+pad, h=lh(f); return {x:x-w/2, y:y-h/2, w, h}; };
  const scr=g=>(g.outline||g.poly).map(o.toScr);
  // Kern eines Kastens: nur die Schrift (Breite ohne Rand, Höhe 0,8 em statt
  // Zeilenhöhe). Letzte Stufe in schräger Ansicht (Gegenprüfung: bei 30° fiel
  // „120“ der Insel und „DA“ ganz weg, weil der achsparallele Kasten nicht
  // ins schräge Teil passt): dann muss nur der Kern im Teil liegen; frei
  // bleibt der ganze Kasten (LP), r ist dann der Kern.
  // (Mehrzeilig: oben und unten je der halbe Zeilenabstand weg.)
  // (k: Höhe des Kerns in em, 0,8 für Ziffern und Versalien; Inhalt mit Unterlängen
  // und Umlauten, hier nur in Schritt 5, braucht 1,0.)
  const core=(r,f,k=0.8)=>{ const e=lh(f)-k*f.px; return {x:r.x+pad/2, y:r.y+e/2, w:r.w-pad, h:r.h-e}; };
  const inP=(r,f,P,tol,k)=>rectIn(tol ? core(r,f,k) : r, P);
  // Inhalt: ls = Zeilen einer Stufe aus contentCands, ein Kasten um alle.
  const mbox=(ls,f,x,y)=>{ const w=Math.max(...ls.map(t=>o.measure(t,f)))+pad, h=ls.length*lh(f); return {x:x-w/2, y:y-h/2, w, h}; };
  const sub=(g,P,ls,x,y,f,tol,k)=>{ const r=mbox(ls,f,x,y);
    if(!(inP(r,f,P,tol,k) && LP.place([r]))) return false;
    // Zeilenkästen fortlaufend addiert: Ober- und Unterkante zweier Zeilen
    // sind dieselbe Zahl (sonst überlappten sie um eine Rundungsstelle).
    let y0=r.y;
    ls.forEach(t=>{ const w=o.measure(t,f)+pad, ri={x:x-w/2, y:y0, w, h:lh(f)}; y0+=lh(f);
      out.push({id:g.it.id, role:'sub', txt:t, font:f, x, y:ri.y+ri.h/2, r:tol ? core(ri,f,k) : ri}); });
    return true; };
  // Block: Kopfzeilen frei und im Teil; die Inhaltszeile darunter wird nur im
  // Teil freigehalten und erst nach den Hängeschränken belegt. Variante vor
  // Ort: erst jede Stelle für die längste Kopfzeile, dann kürzen – sonst
  // schrumpfte „H 60“ zu „H“, obwohl es weiter entlang der Wand passte.
  // anchors(bw, bh) → Mittelpunkte für einen Block dieser Größe. RV: die
  // für Unterschrank-Inhalte freigehaltenen Zeilen. Ein Hängeschrank meidet
  // sie je Kopfzeile erst ganz (mit, dann ohne Inhalt), bevor er sie überdeckt,
  // und nimmt seinen Inhalt nur, wo der schon jetzt frei ist – sonst stand das
  // „H“ über einem Inhalt, der dann gekürzt wurde oder woanders landete.
  const RV=C.labelPlacer(), occ=new Map();   // occ: Etikett → belegter Kasten (für 2c)
  // tol: letzte Stufe, nur der Kern im Teil (anchors bekommt die Kernmaße).
  const block=(g, P, anchors, heads, f0, tol, kS)=>{
    const subs=contentCands(g.it), wall=f0===fW, fs=wall ? fWS : fS;
    for(const H of heads) for(const strict of wall ? [true,false] : [false]) for(const s of [...subs, null]){
      const F=H.map((t,i)=>i ? fT : f0), sh=s ? s.length*lh(fs) : 0, tot=F.reduce((h,f)=>h+lh(f),0)+sh;
      const bw=Math.max(...H.map((t,i)=>o.measure(t,F[i])), ...(s ? s.map(t=>o.measure(t,fs)) : [0]))+pad, fl=s ? fs : F[F.length-1];
      const C2=anchors(tol ? bw-pad : bw, tol ? tot-(lh(F[0])-0.8*F[0].px)/2-(lh(fl)-(s ? kS||0.8 : 0.8)*fl.px)/2 : tot).map(a=>{ let y=a.y-tot/2;
        const R=H.map((t,i)=>{ const r=box(t,F[i],a.x,y+lh(F[i])/2); y+=lh(F[i]); return r; }), sb=s && mbox(s,fs,a.x,y+sh/2);
        return {a, R, sb, ok:R.every((r,i)=>inP(r,F[i],P,tol) && LP.free(r)) && (!s || (inP(sb,fs,P,tol,kS) && (!wall || (LP.free(sb) && RV.free(sb))))),
          rv:R.every(r=>RV.free(r))}; });
      const k=C2.find(k=>k.ok && (k.rv || !strict)); if(!k) continue;
      k.R.forEach((r,i)=>{ const l={id:g.it.id, role:i ? 'tag' : wall ? 'wall' : 'head', txt:H[i], font:i ? fT : f0, x:k.a.x, y:r.y+r.h/2, r:tol ? core(r,F[i]) : r};
        LP.occupy(r); out.push(l); occ.set(l, r); });
      if(s){ if(!wall) RV.occupy(k.sb); pend.push({g, P, x:k.a.x, y:k.sb.y+k.sb.h/2, f:fs, tol, kS, subs:subs.slice(subs.indexOf(s))}); }
      return true;
    }
    return false;
  };
  // Stellen im Hängeschrank für einen Block bw × bh: an der Wandseite zuerst,
  // dann tiefer; entlang Mitte, Drittel und bündig an beiden Enden. Bündig im
  // Bildschirm gerechnet (Ausdehnung des Kastens auf Wand und Normale) – mit
  // festen Bruchteilen fiel „DA“ im geteilten Bild um 1 px aus dem Korpus.
  const wallAnchors=g=>{
    const p0=o.toScr(wpt(g.Wf,g.s0,0)), p1=o.toScr(wpt(g.Wf,g.s1,0)), p2=o.toScr(wpt(g.Wf,g.s0,g.d));
    const Ls=Math.hypot(p1.x-p0.x,p1.y-p0.y), Ds=Math.hypot(p2.x-p0.x,p2.y-p0.y);
    if(!Ls || !Ds) return ()=>[];
    const u={x:(p1.x-p0.x)/Ls, y:(p1.y-p0.y)/Ls}, n={x:(p2.x-p0.x)/Ds, y:(p2.y-p0.y)/Ds};
    return (bw,bh)=>{
      const eu=(Math.abs(u.x)*bw+Math.abs(u.y)*bh)/2+0.5*dpr, en=(Math.abs(n.x)*bw+Math.abs(n.y)*bh)/2+0.5*dpr;
      if(2*eu>Ls || 2*en>Ds) return [];
      const cl=(v,e,l)=>Math.min(Math.max(v,e/l),1-e/l), uniq=A=>A.filter((v,i)=>A.findIndex(w=>Math.abs(w-v)<1e-6)===i);
      const T=uniq([0.5,0.3,0.7,0,1,0.15,0.85].map(t=>cl(t,eu,Ls))), Q=uniq([0,0.4,0.55,0.7,1].map(q=>cl(q,en,Ds))), A=[];
      Q.forEach(q=>T.forEach(t=>A.push({x:p0.x+u.x*Ls*t+n.x*Ds*q, y:p0.y+u.y*Ls*t+n.y*Ds*q})));
      return A;
    };
  };
  const G=L.G.filter(g=>!g.wing);
  // 1. Unter-/Hochschrank, Insel, Tisch: um den Flächenschwerpunkt (Eckschrank:
  //    des Umrisses; liegt der außerhalb, die Korpusmitte).
  //    Eckschrank über Eck: passt der Block dort nicht (Inhalt fiel bei
  //    „Eck 90“ immer weg), auch Korpusmitte und Mitte des Schenkels.
  const baseA=new Map();
  G.filter(g=>g.it.kind!=='wall').forEach(g=>{
    const W=g.outline||g.poly; let c=areaCentroid(W); if(!TL.pointInRing(c,W)) c=g.c;
    const cs=[c, g.c, ...L.G.filter(w=>w.wing && w.it.id===g.it.id).map(w=>areaCentroid(w.poly))]
      .filter((p,i,A)=>A.findIndex(q=>Math.hypot(q.x-p.x,q.y-p.y)<1)===i);
    const A=cs.map(o.toScr); baseA.set(g, ()=>A); block(g, scr(g), ()=>A, headCands(g,L), fH);
  });
  // 2. Hängeschrank/Dunstabzug: kursiv, an der Wandseite zuerst, dann entlang
  //    der Wand – nie auf der Breite des Unterschranks darunter.
  const wallA=new Map();
  G.filter(g=>g.it.kind==='wall').forEach(g=>{
    const A=wallAnchors(g); wallA.set(g, A); block(g, scr(g), A, headCands(g,L), fW);
  });
  // 2b. Teile ganz ohne Kopfzeile (schräge Ansicht): letzte Stufe mit Kern im
  //     Teil – erst jetzt, damit kein Nachbar seinen strengen Platz verliert.
  const has=new Set(out.map(l=>l.id));
  G.filter(g=>!has.has(g.it.id)).forEach(g=>{ const wall=g.it.kind==='wall';
    block(g, scr(g), wall ? wallA.get(g) : baseA.get(g), headCands(g,L), wall ? fW : fH, true); });
  // 2c. Hängeschrank/Dunstabzug weiter ohne Kopfzeile, weil die Breite des
  //     Unterschranks darunter (Kochfeld „90“, ohne Inhalt) mitten unter ihm
  //     steht: die Breite rückt an eine andere Stelle ihres Teils (streng),
  //     wenn dann „DA“ (Kern) daneben passt – sonst bleibt alles wie es war.
  const drop=ls=>ls.forEach(l=>{ out.splice(out.indexOf(l),1); const i=LP.rects.indexOf(occ.get(l)); if(i>=0) LP.rects.splice(i,1); });
  G.filter(g=>g.it.kind==='wall' && !out.some(l=>l.id===g.it.id)).forEach(g=>{
    const hs=G.filter(h=>h.it.kind==='base' && !h.free && h.Wf && g.Wf && h.Wf.key===g.Wf.key && h.s0<g.s1 && g.s0<h.s1 && !contentCands(h.it).length);
    for(const h of hs){
      const old=out.filter(l=>l.id===h.it.id); if(!old.length) continue;
      drop(old);
      const WA=wallAnchors(h), Ph=scr(h), Pg=scr(g); let ok=false;
      for(let i=0; i<35 && !ok; i++){ const m=out.length;
        if(!block(h, Ph, (bw,bh)=>WA(bw,bh).slice(i,i+1), headCands(h,L), fH)) continue;
        if(block(g, Pg, wallA.get(g), headCands(g,L), fW, true)) ok=true; else drop(out.slice(m)); }
      if(ok) return;
      old.forEach(l=>{ out.push(l); LP.occupy(occ.get(l)); });
    }
  });
  // 3. Inhalte in den freigehaltenen Platz; stößt er an, kürzer, sonst entfällt er.
  const done=new Set();
  pend.forEach(p=>{ if(p.subs.some(s=>sub(p.g,p.P,s,p.x,p.y,p.f,p.tol,p.kS))) done.add(p.g); });
  // 4. Hängeschrank-Inhalt, der unter dem „H“ keinen Platz fand (meist über
  //    einem Unterschrank mit eigenem Inhalt): kursiv an einer anderen freien
  //    Stelle des Hängeschranks, sonst fehlte er im Plan ganz (Gegenprüfung).
  wallA.forEach((A,g)=>{ if(done.has(g) || !out.some(l=>l.id===g.it.id && l.role==='wall')) return; const P=scr(g);
    contentCands(g.it).some(s=>{ const b=mbox(s,fWS,0,0); return A(b.w, b.h).some(a=>sub(g,P,s,a.x,a.y,fWS)); }); });
  // Waagerechte Schnitte des Teils (Bildschirm): die x-Werte, an denen der Umriss die Höhe yy kreuzt, aufsteigend.
  const cut=(P,yy)=>P.flatMap((p,i)=>{ const q=P[(i+1)%P.length]; return (p.y<=yy)!==(q.y<=yy) ? [p.x+(yy-p.y)/(q.y-p.y)*(q.x-p.x)] : []; }).sort((a,b)=>a-b);
  // Mitten, an denen der Kern des Inhalts s (Mitte y) zwischen den Schnitten oben und unten Platz hat: erst x selbst
  // (unter der Kopfzeile), dann die zu x nächste und die mittlere Stelle des freien Stücks – im schrägen Teil rückt
  // der Schnitt mit y, ein Kasten genau unter der Kopfzeile ragt sonst an einer Seite heraus.
  const xs=(P,s,f,x,y)=>{ const wc=Math.max(...s.map(t=>o.measure(t,f))), hc=(s.length-1)*lh(f)+f.px, A=cut(P,y-hc/2), B=cut(P,y+hc/2), X=[x];
    for(let i=0; i+1<A.length; i+=2) for(let j=0; j+1<B.length; j+=2){ const lo=Math.max(A[i],B[j])+wc/2, hi=Math.min(A[i+1],B[j+1])-wc/2;
      if(lo<=hi) X.push(Math.min(Math.max(x,lo),hi), (lo+hi)/2); }
    return X.filter((v,i)=>X.indexOf(v)===i); };
  // 5. Teile mit Kopfzeile, aber ohne Inhalt, weil Kopfzeile + Inhalt als Block
  //    nirgends ganz (mit Rand) ins Teil passen – schräge Ansicht, kleiner
  //    Maßstab: der Inhalt unter oder über die Kopfzeile (wo der Schnitt des
  //    schrägen Teils es verlangt, seitlich gerückt), nur der Kern im Teil
  //    (1,0 em, wegen Unterlängen und Umlauten). Sonst Kopfzeile + Inhalt neu
  //    als Block mit Kern im Teil (die Kopfzeile darf rücken, alle anderen
  //    stehen schon); gelingt beides nicht, bleibt alles, wie es war. Die
  //    Kopfzeile wird dabei nie kürzer als sie steht (Breite geht dem Inhalt vor:
  //    sonst wurde aus „H 45“ ein „H“ mit „+4“).
  G.forEach(g=>{ const mine=out.filter(l=>l.id===g.it.id);
    if(!contentCands(g.it).length || !mine.length || mine.some(l=>l.role==='sub') || !mine.every(l=>occ.has(l))) return;
    const wall=g.it.kind==='wall', f=wall ? fWS : fS, P=scr(g), x=mine[0].x, top=Math.min(...mine.map(l=>occ.get(l).y)), bot=Math.max(...mine.map(l=>occ.get(l).y+occ.get(l).h));
    if(contentCands(g.it).some(s=>{ const h=s.length*lh(f); return [bot+h/2, top-h/2].some(y=>xs(P,s,f,x,y).some(px=>sub(g,P,s,px,y,f,true,1))); })) return;
    const hc=headCands(g,L), cur=hc.findIndex(H=>H.length===mine.length && H.every((t,i)=>mine[i].txt===t));
    const np=pend.length; drop(mine); const m=out.length;
    if(block(g, P, wall ? wallA.get(g) : baseA.get(g), cur<0 ? hc : hc.slice(0,cur+1), wall ? fW : fH, true, 1) && pend.length>np){
      const p=pend.pop(); if(p.subs.some(s=>sub(p.g,p.P,s,p.x,p.y,p.f,p.tol,1))) return; }
    pend.length=np; drop(out.slice(m)); mine.forEach(l=>{ out.push(l); LP.occupy(occ.get(l)); }); });
  return {labels:out, LP};
}
// Stationsetikett der Wege (Rollen an einem Punkt q, Bildschirm). Gegenprüfung:
// war rechts/links/oben/unten nichts frei, stand der kurze Text erzwungen
// rechts – über anderen Stationen, Maßzahlen (Klick traf das Maß) und der
// Eingangs-Pille. Jetzt in Ringen (7 … 90 px) und 64 Richtungen (je Ring
// zuerst die 16 Hauptrichtungen, dann die dazwischen: ein freier Platz nahe am
// Punkt ist so fast immer da), voller Text vor dem kurzen (je Rolle das erste
// Wort); ab 28 px mit Führungslinie (lead: Punkt am Kasten, meist der nächste).
// Nur wenn nirgends frei ist, der kurze Text an der am wenigsten überdeckten
// Stelle, die kein hartes Rechteck (hard: Eingang, anklickbares Maß,
// Stationspunkt) berührt – forced.
// o={dpr, measure, skip (Rollen ohne eigenes Etikett, z. B. 'eingang', wenn
// die Pille gezeichnet ist), view {w,h} (Leinwand)}. null: nichts zu schreiben.
function stationLabel(LP, q, roles, o){
  const dpr=o.dpr||1, f={px:PLAN_TXT.sub*dpr, weight:600}, h=16*dpr, skip=o.skip||[];
  const rs=roles.filter(r=>!skip.includes(r)); if(!rs.length) return null;
  const full=rs.map(r=>ROLE_LABEL[r]||r).join(' · '), short=rs.map(r=>(ROLE_LABEL[r]||r).split(/[ ,]/)[0]).join(' · ');
  const V=o.view, onView=r=>!V || (r.x>=0 && r.y>=0 && r.x+r.w<=V.w && r.y+r.h<=V.h);
  // Ring k: Kasten so, dass seine Ausdehnung in Richtung a um gap neben q
  // beginnt (wie dimLabel); erst die vier Seiten, dann Schrägen, dann dazwischen
  // (D16 in Rangfolge, danach dieselbe Folge um 11,25°, 5,625° und 16,875° gedreht).
  const GAP=[7,16,28,44,64,90], D16=[0,180,270,90,315,45,225,135,337.5,22.5,202.5,157.5,292.5,67.5,247.5,112.5];
  const DIR=[...D16, ...D16.map(a=>a+11.25), ...D16.map(a=>a+5.625), ...D16.map(a=>a+16.875)];
  const ring=(t,k,any,D=DIR)=>{ const gap=GAP[k]*dpr, w=o.measure(t,f)+8*dpr;
    return D.map(a=>{ const dx=Math.cos(a*Math.PI/180), dy=Math.sin(a*Math.PI/180), e=gap+(Math.abs(dx)*w+Math.abs(dy)*h)/2;
      return {x:q.x+dx*e-w/2, y:q.y+dy*e-h/2, w, h, txt:t, k}; }).filter(r=>any || onView(r)); };
  // Nah zuerst: voll in den ersten beiden Ringen, dann kurz; weiter außen je Ring voll, kurz.
  const K=GAP.map((g,k)=>k), T=short!==full ? [[full,0],[full,1],[short,0],[short,1], ...K.slice(2).flatMap(k=>[[full,k],[short,k]])] : K.map(k=>[full,k]);
  // Weit abgesetzt (Ring ≥ 2): bevorzugt ein Platz, dessen Führungslinie durch
  // kein belegtes Rechteck läuft (Maßzahl, Teil-Etikett, andere Station), keine
  // schon gezogene Linie (LP.leads) kreuzt und nicht durch deren Kasten läuft.
  // Gibt es keinen, gilt der Platz mit den wenigsten Kreuzungen (erst Rechtecke, dann Linien).
  const leadAt=r=>({x:Math.min(Math.max(q.x, r.x), r.x+r.w), y:Math.min(Math.max(q.y, r.y), r.y+r.h)});
  const leads=LP.leads||(LP.leads=[]), e=1e-3;
  const inR=(p,b)=>p.x>b.x+e && p.x<b.x+b.w-e && p.y>b.y+e && p.y<b.y+b.h-e;
  const segHits=(a,b,R)=>{ let t0=0, t1=1; const dx=b.x-a.x, dy=b.y-a.y;   // Liang–Barsky, Rand zählt nicht
    for(const [pp,qq] of [[-dx,a.x-R.x-e],[dx,R.x+R.w-e-a.x],[-dy,a.y-R.y-e],[dy,R.y+R.h-e-a.y]]){
      if(Math.abs(pp)<1e-9){ if(qq<0) return false; continue; }
      const t=qq/pp; if(pp<0){ if(t>t1) return false; if(t>t0) t0=t; } else { if(t<t0) return false; if(t<t1) t1=t; } }
    return t1-t0>1e-6; };
  const dist=z=>Math.hypot(z.x-q.x, z.y-q.y);
  const EDGE=[[0,0],[.25,0],[.5,0],[.75,0],[1,0],[0,1],[.25,1],[.5,1],[.75,1],[1,1],[0,.25],[0,.5],[0,.75],[1,.25],[1,.5],[1,.75]];
  // Linie zum Kasten c: Ansatz am nächsten Punkt; kreuzt sie etwas, zählt auch
  // ein anderer Randpunkt bis 30 px weiter weg, den die Linie von außen erreicht
  // (sonst lief sie durch eine Maßzahl, obwohl ein Strich daneben frei war).
  // n: Kreuzungen mit Kästen (belegt, schon gezogene Linie durch c), x: mit
  // schon gezogenen Linien, z: Ansatzpunkt. Nahe Plätze (Ring < 2): ohne eigene
  // Linie, aber eine schon gezogene Linie darf nicht durch sie laufen.
  const nX=c=>{ if(c.k<2) return {n:leads.filter(([a,b])=>segHits(a,b,c)).length, x:0};
    const z0=leadAt(c), n0=leads.filter(([a,b])=>segHits(a,b,c)).length;
    const R=LP.rects.filter(b=>!inR(q,b) && b.x<Math.max(q.x,c.x+c.w) && b.x+b.w>Math.min(q.x,c.x) && b.y<Math.max(q.y,c.y+c.h) && b.y+b.h>Math.min(q.y,c.y));
    const at=z=>({n:n0+R.filter(b=>segHits(q,z,b)).length, x:leads.filter(([a,b])=>C.segCross(q,z,a,b)).length, z});
    let best=at(z0);
    if(best.n+best.x>0) EDGE.forEach(([fx,fy])=>{ const z={x:c.x+c.w*fx, y:c.y+c.h*fy};
      if(dist(z)>dist(z0)+30*dpr || segHits(q,z,c)) return;
      const m=at(z); if(m.n<best.n || (m.n===best.n && (m.x<best.x || (m.x===best.x && dist(z)<dist(best.z)-1e-6)))) best=m; });
    return best; };
  // Der erste freie Platz ohne Kreuzung gewinnt (die Reihenfolge ist die
  // Rangfolge), sonst der mit den wenigsten.
  let B=null;
  for(const [t,k] of T){ for(const c of ring(t,k)){ if(!LP.free(c)) continue;
      const m={c, ...nX(c)}; if(!B || m.n<B.n || (m.n===B.n && m.x<B.x)) B=m;
      if(!B.n && !B.x) break; }
    if(B && !B.n && !B.x) break; }
  let r=B ? LP.occupy(B.c) : null, forced=false;
  if(!r){
    // Überdeckung je Kandidat: hart zählt wie unendlich, sonst die Fläche.
    const ov=(a,b)=>Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
    const cost=c=>LP.rects.reduce((s,b)=>{ const a=ov(c,b); return s + (a>1e-3 && b.hard ? 1e9 : a); }, 0);
    let S=K.flatMap(k=>ring(short,k,false,D16)); if(!S.length) S=ring(short,0,true,D16);   // Notlösung: nur die 16 Hauptrichtungen (Kosten wie früher)
    r=LP.occupy(S.map(c=>({c, v:cost(c)})).sort((a,b)=>a.v-b.v)[0].c); forced=true;
  }
  // Führungslinie zum gewählten Randpunkt des Kastens (meist der nächste), wenn er weiter weg steht.
  const lead=r.k>1 ? ((!forced && B.z) || leadAt(r)) : null;
  if(lead) leads.push([{x:q.x, y:q.y}, lead]);
  return {txt:r.txt, font:f, r, lead, forced};
}
// Hindernisse nur für Stationsetiketten, unmittelbar vor stationLabel: die
// Stationspunkte und die ganzen Klickflächen anklickbarer Maße (hits, je 3 px
// größer als die Zahl). Die Klickflächen gehören nicht in die Belegt-Liste,
// bevor planLabels läuft – sonst verlieren Teile bei gewähltem Teil Etiketten.
function stationBlock(LP, pts, hits, dpr){
  (hits||[]).forEach(h=>LP.occupy({x:h.x, y:h.y, w:h.w, h:h.h, hard:true}));
  (pts||[]).forEach(q=>LP.occupy({x:q.x-5*dpr, y:q.y-5*dpr, w:10*dpr, h:10*dpr, hard:true}));
  return LP;
}
// Berührt der Punkt q (Radius r) die Pille pl = {q: Mitte, w, h}, mit gap Luft?
// Das Rechteck genügt; die Rundung der Pille zählt nicht (der Punkt weicht eher).
const pillTouch=(q, pl, r, gap)=>Math.hypot(Math.max(Math.abs(q.x-pl.q.x)-pl.w/2, 0), Math.max(Math.abs(q.y-pl.q.y)-pl.h/2, 0))<r+gap;
// Maßzahl nur, wenn ihr Kasten (w × h) in die Strecke p–q passt: seine
// Ausdehnung entlang der Strecke, gemessen statt fester Pixelschwelle.
const dimFits=(p,q,w,h,pad)=>{ const l=Math.hypot(q.x-p.x,q.y-p.y); if(!l) return false;
  return Math.abs(q.x-p.x)/l*w + Math.abs(q.y-p.y)/l*h + (pad||0) <= l; };
// Diagramme im Analysebereich: viewBox = tatsächliche Breite in CSS-px, damit
// die Schrift wirklich 11 px hat (früher 520 Einheiten auf 410–480 px
// gestaucht → 8–9 px). Versteckt (Breite 0): 520 wie bisher.
const chartBox=cssW=>{ const W=cssW>0 ? Math.max(240, Math.floor(cssW)) : 520;
  return {W, fs:Math.ceil(PLAN_TXT.sub*W/(cssW>0 ? cssW : W))}; };
// Wie viele Inhalte ein Schrank beim Umsortieren / Optimal einräumen höchstens
// bekommt. Hochschrank mit Gerät: je Fach eins.
function storeCap(it, S){
  if(tallDev(it)) return devZones(it,S).length;
  return it.kind==='tall' ? 3 : it.w>=800 ? 3 : it.w>=450 ? 2 : 1;
}
globalThis.KITCHEN={ FRIDGE, DOORT_LIM, SWINGS, swingOf, isCold, fzOf, hasHinge, cornerDeleted, doorTOf, leaves, leafRect, leafReach, leafReachSide, entries, entryOptions, storable, storeCap, storeFits, fitStores, dwZones, devZones, devSegs, tallDev, DEV_H, LOW_ZONE_TOP, dwZoneFor, DW_ZONE_MIN, DW_LOW, wallFaces, K_DEF, K_LIM, WIDTHS, KIND, DEV, FRONTS, PRESETS, PGROUPS, CONTENTS, FLOWS, GROUPS, ROLE_LABEL, BODY_R,
  derived, devZ, ovenBelow, DW_H, normKitchen, normItem, isEmpty, anchorFrame, makeEnv, wallFrame, wpt, geom, dims, layout, envelopes, frontLR, frontKind,
  worktops, check, hoseCheck, alongWall, waterPts, HOSE, sashes, doorReach, optimalStore, hungarian, openingOn, faucetPoint, tableSides, tableSeats, seatPlan, rotSnaps, snapRot, chainDims, freeDims, applyDim, dockFree, barNkba, barSeats, BAR_SEAT_W, slotCandidates, cornerStop, fitsAt, freeSlot, snapX,
  nearestWall, planner, stations, flows, suggest, heatGrid, kidPoly, conflicts, PAIRS, sweep, placeOk, reachFactor, scene, frontsOf, stock, nameOf, inflate, polyInRoom, COL };
Object.assign(globalThis.KITCHEN, { CORNER, CSHAPE, shapeOf, cornerBlind, cornerPlace, cornerType, crossAt, cornerWing });
Object.assign(globalThis.KITCHEN, { PLAN_TXT, planLabels, stationLabel, stationBlock, contentCands, headCands, nomCm, devTag, dimFits, chartBox, rectIn });
Object.assign(globalThis.KITCHEN, { snapIsland, islandTops, topsTouch, partsClash });
// Exporte der Rest-Fixes der Küchen-Review (je Gruppe eine Zeile)
Object.assign(globalThis.KITCHEN, { ceilAt, ceilMin });
Object.assign(globalThis.KITCHEN, { placeOnWall, clipItem, cornerDrop, clearCorner, frontSet });
Object.assign(globalThis.KITCHEN, { dimCheck, dimInput, dimKey, dimResolve, wallReach, rayPoly, centroid });
Object.assign(globalThis.KITCHEN, { standAt });
Object.assign(globalThis.KITCHEN, { specReset, reachDelta });
Object.assign(globalThis.KITCHEN, { ovenZ, DRAWER_TOP });
// --- Zustand der Bedienung: reine Regeln, hier statt in kitchen-ui, weil nur dieser Block im Selbsttest läuft ---
// Schlüssel der Prüfliste im Panel: alles, was die Knöpfe zeigen und was ihre Handler beim Klick brauchen
// (Teile-ids, Abhilfe samt Feldern). Nur Stufe und Text zu nehmen ließ nach einem Platztausch gleich benannter
// Teile (gleiche Texte, andere ids) die alten ids im Handler und das falsche aria-current stehen.
const checksKey=(F, sel)=>JSON.stringify([F.map(f=>[f.lvl, f.txt, f.ids, f.fix||null]), sel]);
// Schlüssel der Kästen für das gewählte Teil und den Eckschrank. Dazu gehört die Ansichtsdrehung: links/rechts
// bzw. oben/unten, die Reihenfolge der Lagefelder und die Eckenknöpfe folgen der Wand, wie sie auf dem
// Bildschirm liegt (wallEnds über toScr) und müssen nach dem Drehen neu gebaut werden.
const selBoxKey=(it, spec, bad, rot)=>JSON.stringify([it, spec, bad, rot]);
const cornerBoxKey=(it, ctxKey, rot)=>JSON.stringify([it, ctxKey, rot]);
// Tasten, die ein fokussiertes Bedienelement selbst verbraucht und die der Plan dann nicht anfassen darf:
// der Drehregler nimmt Pfeile, Pos1/Ende und Bild auf/ab (1° statt die Insel zu schieben).
const controlOwnsKey=(key, tag, type)=>tag==='INPUT' && type==='range'
  && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(key);
// Küchenzustand der Sitzung, der zu EINEM Raum gehört und beim Raumwechsel auf Anfang muss: Auswahl, Ablauf,
// Vorschlag, Ziehen; die zuletzt benutzte Wand (A–B gibt es in jedem Raum, meint dort eine andere), die
// Referenz der Wege-Analyse (verglichen würde gegen die Küche des alten Raums) und das scharf geschaltete
// „Alle entfernen“ (ein Klick leerte sonst die Küche des neuen Raums). Einstellungen (3D, Wege, Analyse),
// Zwischenablage und Zwischenspeicher bleiben: die hängen an ihrem Inhalt.
const roomBound=()=>({ sel:null, flow:null, hl:null, drag:false, lastWall:null, ref:null, clearArmed:null, ctxKey:'', ctx:null });
// Speichern bei gehaltener Taste: je Wiederholung nur vormerken (mark), einmal ausführen beim Loslassen (flush)
// oder nach delay ms Ruhe, falls das keyup nie ankommt; cancel verwirft. Uhr eingehängt: der Selbsttest wartet nicht.
function deferSave(run, delay, clock){
  const T=clock || {set:(f,ms)=>setTimeout(f,ms), clear:t=>clearTimeout(t)};
  let t=null, pend=false;
  const stop=()=>{ if(t!=null){ T.clear(t); t=null; } };
  const d={
    mark(){ pend=true; stop(); t=T.set(()=>{ t=null; d.flush(); }, delay); },
    flush(){ stop(); if(!pend) return false; pend=false; run(); return true; },
    cancel(){ stop(); pend=false; },
    get pending(){ return pend; },
  };
  return d;
}
Object.assign(globalThis.KITCHEN, { checksKey, selBoxKey, cornerBoxKey, controlOwnsKey, roomBound, deferSave });
Object.assign(globalThis.KITCHEN, { copySpot, dupOnWall, sweepGaps, normUi, roleList, undoHint, DIM_NOTE });
Object.assign(globalThis.KITCHEN, { pillTouch });
})();
