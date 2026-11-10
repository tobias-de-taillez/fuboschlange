// raum-meldung.js – „Fehler / Wunsch melden“ für jedes Werkzeug der Familie
// (docs/adr/0001-familie-mit-geteilten-js-dateien.md): Fehlerprotokoll,
// schwebender Knopf unten links, Meldedialog, Versand an bugreport.php und das
// lokale Nachstellen einer Meldung. Aus den früheren Blöcken "meldung-log" und
// "meldung" von raumaufmass.html; Markup und CSS bringt die Datei selbst mit
// und fügt sie beim Laden ins Dokument ein. Läuft nur im Browser.
// Braucht: nichts. Neben der Seite liegen bugreport.php (Empfänger) und
// datenschutz-meldung.html (im Dialog verlinkt).
// Einbinden: als klassisches Skript, am besten als erstes im Kopf der Seite –
// das Fehlerprotokoll schreibt ab dem Laden mit, Knopf und Dialog entstehen,
// sobald es <body> gibt (im Kopf geladen: bei DOMContentLoaded, also nach
// allen Skripten der Seite). Zweimal laden fügt nichts doppelt ein.
// Erwartet vom Werkzeug: nichts. Benutzt, wenn vorhanden (erst beim Aufruf,
// nicht beim Laden):
//   MELDUNG_STAND   Stand der Seite, falls sie ihn selbst trägt (so war es
//                   im Block "meldung"). Nötig ist das nicht mehr: den Stand
//                   trägt diese Datei, siehe STAND unten.
//   MELDUNG_LOG     ein schon laufendes Fehlerprotokoll wird weiterbenutzt
//   cv              Zeichenfläche: ihr Bild geht mit; ohne sie nur „Ganzes
//                   Fenster aufnehmen“, wo der Browser das kann
//   M, serialize, undoStack, redoStack, currentRoom und die Ansichts-Namen
//                   der Bedienung (VIEW, userView, …): offener Raum und
//                   Oberfläche im App-Zustand
//   STORE           Zahl der Räume im Dialogtext; die Räume selbst kommen aus
//                   localStorage (alle Schlüssel, die mit raumaufmass beginnen)
//   setHint, setHintLive, hidePop: Rückmeldung in der Statuszeile, sonst im
//                   eigenen Hinweis unten links
//   #mldMenu        Menüeintrag, der den Dialog öffnet (entfällt künftig)
//   deserialize, recompute, render, openRoom, setMode: nur fürs Nachstellen
//                   (?meldung=… auf localhost); ohne sie bleibt es aus
// Legt an: globalThis.MELDUNG_LOG (falls noch nicht da) und
// globalThis.RAUM_MELDUNG = { aufbauen(), oeffnen(), schliessen() }.
"use strict";

// ================= Fehlerprotokoll =================
// Ab dem Laden dieser Datei mitschneiden, was der Browser an Fehlern wirft,
// damit eine Meldung zeigt, was vorher schiefging. Ringpuffer, nur im
// Speicher; geht nur mit einer Meldung raus. Läuft schon ein Protokoll (der
// frühere Inline-Block "meldung-log" oder diese Datei ein zweites Mal), wird
// es weiterbenutzt und nichts doppelt eingehängt.
(function(){
  if(typeof document==='undefined' || Array.isArray(globalThis.MELDUNG_LOG)) return;
  const L=globalThis.MELDUNG_LOG=[], MAX=80, t0=Date.now();
  const s=v=>{ try{ return v instanceof Error ? (v.stack||String(v)) : typeof v==='string' ? v : JSON.stringify(v); }catch(e){ return String(v); } };
  const add=(art,teile)=>{ L.push({t:Date.now()-t0, art, text:teile.map(s).join(' ').slice(0,4000)}); if(L.length>MAX) L.shift(); };
  addEventListener('error',e=>add('error',[e.message, (e.filename||'')+':'+e.lineno+':'+e.colno, e.error&&e.error.stack||'']));
  addEventListener('unhandledrejection',e=>add('promise',[e.reason]));
  for(const k of ['error','warn']){
    const orig=console[k];
    console[k]=function(...a){ add('console.'+k,a); return orig.apply(this,a); };
  }
})();

// ================= Fehler / Wunsch melden =================
// Schwebender Knopf unten links, in jedem Zustand sichtbar (über allen
// Overlays), per × für die laufende Sitzung ausblendbar. Die Meldung trägt
// Text, ein Bild der Zeichenfläche und den genauen Zustand (Raum, Ansicht,
// Auswahl, Rückgängig, Einstellungen, Fehlerprotokoll) – genug, um sie lokal
// mit ?meldung=<datei> nachzustellen. Empfänger ist bugreport.php neben der
// Seite; ohne den (lokal, file://) wird die Meldung als Datei gesichert.
(function(){
if(typeof document==='undefined') return;
// Zweites Laden: nichts neu anlegen, höchstens den Aufbau nachholen.
if(globalThis.RAUM_MELDUNG){ globalThis.RAUM_MELDUNG.aufbauen(); return; }

const $=id=>document.getElementById(id);

// Farben und Schrift kommen aus den Token der Seite; die Rückfallwerte sind
// die der Familie, damit der Dialog auch ohne Token ordentlich aussieht.
// Alles hängt an den eigenen IDs, keine Klasse der Seite wird vorausgesetzt.
const CSS=`
#mldFab,#mldwrap,#mldToast{
  --mld-surface:var(--surface,#faf9f6); --mld-canvas:var(--canvas,#f5f3ed);
  --mld-ink:var(--ink,#24221d); --mld-ink2:var(--ink2,#4b473e); --mld-muted:var(--muted,#6f6a5e);
  --mld-line:var(--line,#d8d3c6); --mld-line2:var(--line2,#e8e4da);
  --mld-hover:var(--hover,#eeeae0); --mld-press:var(--press,#e4dfd3);
  --mld-accent:var(--accent,#c2410c); --mld-accent-hover:var(--accent-hover,#a8380a);
  --mld-accent-bg:var(--accent-bg,#f9e7dc); --mld-accent-line:var(--accent-line,#ebbda2);
  --mld-good:var(--good,#1a6b34); --mld-bad:var(--bad,#b3261e);
  font:13px/1.4 var(--font,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);
  color:var(--mld-ink);text-align:left}
#mldFab,#mldFab *,#mldwrap,#mldwrap *,#mldToast{box-sizing:border-box}
#mldFab[hidden],#mldwrap[hidden],#mldToast[hidden],#mldwrap [hidden]{display:none!important}
#mldFab :focus-visible,#mldwrap :focus-visible{outline:2px solid var(--mld-accent);outline-offset:1px}

/* Schwebender Knopf unten links, über allem (und über einer Statuszeile) */
#mldFab{position:fixed;left:12px;bottom:40px;z-index:60;display:flex;align-items:center;
  background:var(--mld-surface);border:1px solid var(--mld-line);border-radius:6px;
  box-shadow:0 2px 10px rgba(36,34,29,.16);opacity:.82;transition:opacity .15s}
#mldFab:hover,#mldFab:focus-within{opacity:1}
#mldFab button{font:inherit;margin:0;border:0;border-radius:4px;background:none;min-height:28px;cursor:pointer}
#mldFab #mldOpen{display:flex;align-items:center;gap:6px;padding:0 8px 0 9px;font-size:12px;color:var(--mld-ink2)}
#mldFab #mldOpen svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
#mldFab #mldOpen:hover{color:var(--mld-accent);background:var(--mld-hover)}
#mldFab #mldHide{width:22px;padding:0;color:var(--mld-muted);font-size:13px;line-height:1;border-left:1px solid var(--mld-line2);border-radius:0 6px 6px 0}
#mldFab #mldHide:hover{color:var(--mld-ink);background:var(--mld-hover)}

/* Dialog */
#mldwrap{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(36,34,29,.28)}
#mldbox{width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow-y:auto;
  background:var(--mld-surface);border:1px solid var(--mld-line);border-radius:8px;box-shadow:0 12px 40px rgba(36,34,29,.22)}
#mldbox button{font:inherit;font-size:13px;margin:0;color:var(--mld-ink);background:var(--mld-surface);
  border:1px solid var(--mld-line);border-radius:4px;padding:0 10px;min-height:28px;cursor:pointer}
#mldbox button:hover{background:var(--mld-hover)}
#mldbox button:active{background:var(--mld-press)}
#mldbox button:disabled{opacity:.45;cursor:default;background:var(--mld-surface)}
#mldhead{display:flex;align-items:center;gap:8px;padding:12px 12px 10px 16px;border-bottom:1px solid var(--mld-line2)}
#mldTitle{font:inherit;font-size:13px;font-weight:600;margin:0;flex:1;color:var(--mld-ink)}
#mldbox #mldClose{width:28px;height:28px;min-height:0;padding:0;display:inline-grid;place-items:center;border:0;background:none;color:var(--mld-ink2)}
#mldbox #mldClose svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
#mldbox #mldClose:hover{background:var(--mld-hover);color:var(--mld-ink)}
#mldbody{padding:12px 16px 4px;display:grid;gap:10px}
#mldArt{display:flex;gap:0}
#mldbox #mldArt button{border-radius:0;margin-left:-1px}
#mldbox #mldArt button:first-child{border-radius:4px 0 0 4px;margin-left:0}
#mldbox #mldArt button:last-child{border-radius:0 4px 4px 0}
#mldbox #mldArt button[aria-pressed=true]{background:var(--mld-accent-bg);color:var(--mld-accent);border-color:var(--mld-accent-line);position:relative}
#mldText{display:block;width:100%;min-height:110px;margin:0;resize:vertical;font:inherit;padding:8px;border:1px solid var(--mld-line);border-radius:4px;background:#fff;color:var(--mld-ink)}
#mldKontakt{display:block;width:100%;height:28px;margin:0;padding:0 8px;font:inherit;border:1px solid var(--mld-line);border-radius:4px;background:#fff;color:var(--mld-ink)}
#mldText::placeholder,#mldKontakt::placeholder{color:var(--mld-muted);opacity:1;font-style:italic}
#mldShot{display:grid;grid-template-columns:160px minmax(0,1fr);gap:12px;align-items:start}
#mldShot.ohne{grid-template-columns:minmax(0,1fr)}
#mldShot img{width:160px;max-height:110px;object-fit:contain;background:var(--mld-canvas);border:1px solid var(--mld-line);border-radius:4px}
#mldShot p{margin:6px 0 0}
#mldbody .mldchk{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--mld-ink2)}
#mldbody .mldchk input{margin-top:2px;accent-color:var(--mld-accent)}
#mldbody #mldEinw{color:var(--mld-ink)}
#mldEinw a{color:var(--mld-accent)}
#mldMsg{font-size:12px;min-height:16px} #mldMsg.bad{color:var(--mld-bad)} #mldMsg.good{color:var(--mld-good)}
#mldfoot{display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;border-top:1px solid var(--mld-line2);position:sticky;bottom:0;background:var(--mld-surface)}
#mldbox #mldSend{background:var(--mld-accent);border-color:var(--mld-accent);color:#fff;font-weight:600}
#mldbox #mldSend:enabled:hover{background:var(--mld-accent-hover);border-color:var(--mld-accent-hover)}

/* Bestätigung nach dem Senden, über dem Knopf */
#mldToast{position:fixed;left:12px;bottom:76px;z-index:61;max-width:min(360px,calc(100vw - 24px));padding:8px 12px;font-size:12px;
  background:var(--mld-surface);border:1px solid var(--mld-line);border-radius:6px;box-shadow:0 2px 10px rgba(36,34,29,.16);cursor:pointer}
/* Gesendet: ein grüner Punkt wie beim Stand, kein farbiger Rand */
#mldToast::before{content:"";display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:50%;background:var(--mld-good);vertical-align:1px}
@media print{ #mldFab,#mldwrap,#mldToast{display:none!important} }
`;

const HTML=`
<div id="mldFab" role="group" aria-label="Fehler melden">
  <button id="mldOpen" type="button" title="Fehler melden oder fehlende Funktion wünschen"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 5.2v3.6M8 10.9v.1"/><path d="M8 1.8 14.6 13.5H1.4z"/></svg>Fehler / Wunsch melden</button>
  <button id="mldHide" type="button" aria-label="Ausblenden" title="Für diese Sitzung ausblenden">×</button>
</div>
<div id="mldwrap" hidden>
  <div id="mldbox" role="dialog" aria-modal="true" aria-labelledby="mldTitle">
    <div id="mldhead"><h2 id="mldTitle">Fehler oder Wunsch melden</h2><button id="mldClose" type="button" aria-label="Schließen" title="Schließen (Esc)"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>
    <div id="mldbody">
      <div id="mldArt" role="group" aria-label="Art der Meldung">
        <button type="button" data-art="fehler" aria-pressed="true">Fehler</button><button type="button" data-art="wunsch" aria-pressed="false">Wunsch</button>
      </div>
      <textarea id="mldText" maxlength="20000" aria-label="Beschreibung" placeholder="Was ist passiert, was hast du erwartet?"></textarea>
      <input id="mldKontakt" type="text" maxlength="200" autocomplete="email" aria-label="Kontakt für Rückfragen (freiwillig)" placeholder="Kontakt für Rückfragen (freiwillig)">
      <div id="mldShot">
        <img id="mldImg" alt="Vorschau des Bildes, das mitgeschickt wird">
        <div>
          <label class="mldchk"><input type="checkbox" id="mldImgOn" checked><span id="mldImgNote">Bild mitsenden</span></label>
          <p><button id="mldWin" type="button" title="Der Browser fragt, was aufgenommen werden soll – diesen Tab wählen">Ganzes Fenster aufnehmen …</button></p>
        </div>
      </div>
      <label class="mldchk" id="mldDatenRow" title="Ohne Zustand lässt sich der Fehler meist nicht nachstellen"><input type="checkbox" id="mldDaten" checked><span id="mldDatenTxt">App-Zustand mitsenden</span></label>
      <label class="mldchk" id="mldEinw"><input type="checkbox" id="mldOk"><span>Ich willige ein, dass meine Meldung (Text und, wenn angehakt, Bild und App-Zustand) nur zur Fehlersuche gespeichert und danach gelöscht wird. <a href="datenschutz-meldung.html" target="_blank" rel="noopener">Datenschutz</a></span></label>
      <div id="mldMsg" role="status"></div>
    </div>
    <div id="mldfoot"><button id="mldCancel" type="button">Abbrechen</button><button id="mldSend" type="button" disabled>Senden</button></div>
  </div>
</div>
<div id="mldToast" role="status" hidden></div>
`;

// --- Aufbau: einmal, sobald es <body> gibt. Im Kopf der Seite geladen, wartet
// er auf DOMContentLoaded – dann sind auch alle Skripte der Seite gelaufen,
// und der Zustand, den das Nachstellen wiederherstellt, steht.
let gebaut=false, wartet=false;
function aufbauen(){
  if(gebaut) return;
  if(!document.body){
    if(!wartet){ wartet=true; document.addEventListener('DOMContentLoaded', aufbauen, {once:true}); }
    return;
  }
  gebaut=true;
  // Steht der Dialog schon im Dokument (alte Seite mit eigenem Markup und
  // eigenem Block "meldung"), gehört er ihr: nichts einfügen, nichts verdrahten.
  if($('mldFab') || $('mldwrap') || $('mldToast')) return;
  if(!$('mldStyle')){
    const st=document.createElement('style'); st.id='mldStyle'; st.textContent=CSS;
    (document.head||document.documentElement).appendChild(st);
  }
  document.body.insertAdjacentHTML('beforeend', HTML);
  verdrahten();
}
const api=globalThis.RAUM_MELDUNG={ aufbauen, oeffnen(){}, schliessen(){} };

function verdrahten(){
// Den Platzhalter ersetzt scripts/deploy-hetzner.sh durch den Commit des
// Stands, in jeder Datei, die ihn trägt – also hier. Ein Upload, der nur die
// HTML-Datei stempelt (früher), wirkt weiter: dann gilt MELDUNG_STAND der
// Seite. Unersetzt: lokal.
const STAND='__MELDUNG_STAND__';
const stand=()=>{
  if(!STAND.startsWith('__')) return STAND;
  const s=typeof MELDUNG_STAND==='string' ? MELDUNG_STAND : '';
  return !s || s.startsWith('__') ? 'lokal' : s;
};
const K_AUS='raumaufmass.meldung.aus', K_NACH='raumaufmass.meldung.nachstellen';
const ss={ get(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } },
           set(k,v){ try{ sessionStorage.setItem(k,v); return true; }catch(e){ return false; } },
           del(k){ try{ sessionStorage.removeItem(k); }catch(e){} } };
const fab=$('mldFab'), wrap=$('mldwrap');
let art='fehler', bildPlan=null, bildFenster=null, sendet=false;

// --- Was das Werkzeug mitbringt. Erst beim Aufruf gefragt, nie beim Laden.
const hatFlaeche=()=>typeof cv!=='undefined' && !!cv && typeof cv.getContext==='function';
const hatModell=()=>typeof M!=='undefined' && !!M;
const hatSpeicher=()=>typeof STORE!=='undefined' && !!STORE;
const offenerRaum=()=>typeof currentRoom!=='undefined' ? currentRoom : null;

// --- Kurze Rückmeldung unten links (verschwindet von selbst oder per Klick).
let toastT=0;
function toast(t){
  const el=$('mldToast'); el.textContent=t; el.hidden=false;
  clearTimeout(toastT); toastT=setTimeout(()=>{ el.hidden=true; }, 12000);
}
$('mldToast').onclick=()=>{ $('mldToast').hidden=true; };
// Hinweise gehen in die Statuszeile des Werkzeugs, wenn es eine hat.
const hinweis=t=>{ if(typeof setHint==='function') setHint(t); else toast(t); };
const hinweisLive=t=>{ if(typeof setHintLive==='function') setHintLive(t); else toast(t); };

// --- Knopf ein-/ausblenden (nur für diese Sitzung)
let ausImSpeicher=false;
const fabSync=()=>{ fab.hidden = ausImSpeicher || ss.get(K_AUS)==='1'; };
// Auf das Menü verweisen nur, solange dort ein beschrifteter Eintrag steht.
const imMenue=()=>{ const m=$('mldMenu'); return !!m && !!m.textContent.trim(); };
if(imMenue()) $('mldHide').title='Für diese Sitzung ausblenden (bleibt im Raum-Menü erreichbar)';
$('mldHide').onclick=()=>{ if(!ss.set(K_AUS,'1')) ausImSpeicher=true; fabSync();
  hinweis('„Fehler / Wunsch melden“ ausgeblendet – bis zum Schließen des Tabs.'+(imMenue() ? ' Weiterhin im Raum-Menü.' : '')); };
fabSync();

// --- Bild der Zeichenfläche. Der Canvas ist durchsichtig (Hintergrund kommt
// aus CSS), also erst mit der Flächenfarbe füllen. JPEG und höchstens
// 1600 px breit: ein Retina-Canvas als PNG wäre schnell mehrere MB.
// Ohne Zeichenfläche (Startbildschirm) gibt es dieses Bild nicht.
function planBild(){
  if(!hatFlaeche()) return null;
  try{
    const w=cv.width, h=cv.height; if(!w || !h) return null;
    const f=Math.min(1, 1600/w), c=document.createElement('canvas');
    c.width=Math.round(w*f); c.height=Math.round(h*f);
    const g=c.getContext('2d');
    g.fillStyle=getComputedStyle(cv).backgroundColor||'#f5f3ed'; g.fillRect(0,0,c.width,c.height);
    g.drawImage(cv,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg',0.85);
  }catch(e){ return null; }
}
// Ganzes Fenster: nur über die Bildschirmfreigabe des Browsers (fragt selbst
// nach). Der Dialog geht dafür kurz weg, damit er nicht im Bild steht.
const kannFenster=()=>!!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
async function fensterBild(){
  let st=null;
  wrap.hidden=true; fab.hidden=true;
  try{
    st=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'}, audio:false,
      preferCurrentTab:true, selfBrowserSurface:'include'});
    const v=document.createElement('video'); v.muted=true; v.playsInline=true; v.srcObject=st;
    await v.play(); await new Promise(r=>setTimeout(r,350));
    const f=Math.min(1, 1920/(v.videoWidth||1)), c=document.createElement('canvas');
    c.width=Math.round(v.videoWidth*f); c.height=Math.round(v.videoHeight*f);
    c.getContext('2d').drawImage(v,0,0,c.width,c.height);
    return c.width ? c.toDataURL('image/jpeg',0.85) : null;
  }catch(e){ return null; }
  finally{ if(st) st.getTracks().forEach(t=>t.stop()); wrap.hidden=false; fabSync(); }
}

// --- Zustand. Sets/Maps als Listen, DOM-Knoten und Funktionen raus.
function roh(v){
  const seen=new WeakSet();
  return JSON.parse(JSON.stringify(v,(k,x)=>{
    if(x instanceof Set) return [...x];
    if(x instanceof Map) return [...x.entries()];
    if(typeof x==='function' || (typeof Node!=='undefined' && x instanceof Node)) return undefined;
    if(x && typeof x==='object'){ if(seen.has(x)) return '[zyklisch]'; seen.add(x); }
    return x;
  }) ?? 'null');
}
// g(f): Wert oder Rückfall. Fängt auch den Namen, den es in diesem Werkzeug
// nicht gibt (ReferenceError) – so wird jeder einzelne Wert der Bedienung
// gelesen, ohne dass einer vorausgesetzt ist.
const g=(f,d=null)=>{ try{ const v=f(); return v===undefined?d:v; }catch(e){ return d; } };
function andereRaeume(){ return hatSpeicher() ? g(()=>STORE.list().filter(r=>r.id!==offenerRaum()).length, 0) : 0; }
function speicher(alle){
  const out={};
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(!k || !k.startsWith('raumaufmass') || k===K_AUS) continue;
      let v=localStorage.getItem(k);
      if(k==='raumaufmass.rooms' && !alle){
        try{ v=JSON.stringify((JSON.parse(v)||[]).filter(r=>r && r.id===offenerRaum())); }catch(e){ v='[]'; }
      }
      out[k]=v;
    }
  }catch(e){ out._fehler=String(e); }
  return out;
}
function sichtbar(){
  const ids=['entry','pop','wpop','cpop','opop','roommenu','libwrap','qrwrap','keyswrap','helpwrap','tip','measDlg'];
  const o={};
  for(const id of ids){
    const el=$(id); if(!el) continue;
    const auf = el.tagName==='DIALOG' ? el.open : !el.hidden;
    if(auf) o[id]=(el.innerText||'').slice(0,4000);
  }
  return o;
}
// Ohne offenen Raum (kein M, kein serialize) bleiben ui leer und raum null;
// die Räume stehen dann wie immer in speicher (raumaufmass.rooms).
function zustand(alle){
  const m=hatModell() ? M : {};
  return {
    stand:stand(), zeit:new Date().toISOString(),
    seite:location.origin+location.pathname,
    umgebung:{
      ua:navigator.userAgent,
      uaData:g(()=>navigator.userAgentData ? {brands:navigator.userAgentData.brands, mobile:navigator.userAgentData.mobile, platform:navigator.userAgentData.platform} : null),
      sprache:navigator.language, zeitzone:g(()=>Intl.DateTimeFormat().resolvedOptions().timeZone),
      fenster:[innerWidth,innerHeight], bildschirm:[screen.width,screen.height], dpr:devicePixelRatio,
      canvas:hatFlaeche() ? [cv.width,cv.height] : null, touch:navigator.maxTouchPoints||0,
      speicherOk:hatSpeicher() ? g(()=>STORE.storageOk) : null, seitDemLaden_ms:Math.round(performance.now()),
    },
    ui:roh({
      mode:m.mode, sel:m.sel, chain:m.chain, wallSel:m.wallSel, openSel:m.openSel,
      highlight:m.highlight, querHl:m.querHl, suspects:m.suspects,
      VIEW:g(()=>VIEW), WV:g(()=>WV), userView:g(()=>userView), wallUserView:g(()=>wallUserView),
      unfoldOn:g(()=>unfoldOn), showEllipses:g(()=>showEllipses), diagOpen:g(()=>diagOpen),
      unit:g(()=>unit), wheelPref:g(()=>wheelPref), currentRoom:offenerRaum(), currentRoomName:g(()=>currentRoomName),
      wpopPair:g(()=>wpopPair), cpopId:g(()=>cpopId), entryPair:g(()=>entryPair),
      ts:g(()=>({tool:TS.tool, sel:TS.sel, vec:TS.vec, lines:TS.lines})), activeTileId:g(()=>activeTileId),
      // Küche: gewähltes Teil, Fronten offen, Ablauf, Analyse, Kind, Referenz (KS liegt in kitchen-ui).
      kueche:g(()=>typeof kitchenUiState==='function' ? kitchenUiState() : null),
      andereRaeume:andereRaeume(), nachbarn:g(()=>neighbors.length,0),
    }),
    raum:typeof serialize==='function' ? g(()=>JSON.parse(serialize())) : null,
    undo:typeof undoStack!=='undefined' && Array.isArray(undoStack) ? undoStack.slice() : [],
    redo:typeof redoStack!=='undefined' && Array.isArray(redoStack) ? redoStack.slice() : [],
    speicher:speicher(alle),
    log:(Array.isArray(globalThis.MELDUNG_LOG) ? globalThis.MELDUNG_LOG : []).slice(),
    hinweis:g(()=>$('hint').textContent,''),
    sichtbar:sichtbar(),
    panel:g(()=>$('panel').innerText.slice(0,30000),''),
  };
}

// --- Dialog
const msg=(t,cls='')=>{ const m=$('mldMsg'); m.textContent=t; m.className=cls; };
function bildZeigen(){
  const b=bildFenster||bildPlan;
  $('mldImg').src=b||''; $('mldImg').hidden=!b;
  $('mldImgOn').disabled=!b;
  $('mldImgNote').textContent = bildFenster ? 'Bild des Fensters mitsenden' : b ? 'Bild mitsenden' : 'Kein Bild verfügbar';
  // Ohne Bild keine leere Vorschauspalte; ohne Bild und ohne Fenster-Aufnahme
  // entfällt die Zeile ganz.
  $('mldShot').classList.toggle('ohne', !b);
  $('mldShot').hidden=!b && !kannFenster();
}
function sendSync(){
  const b=$('mldSend');
  b.disabled = sendet || !$('mldOk').checked || !$('mldText').value.trim();
  b.title = !$('mldText').value.trim() ? 'Erst beschreiben, worum es geht.'
    : !$('mldOk').checked ? 'Erst die Einwilligung anhaken.' : '';
}
function artSetzen(a){
  art=a;
  for(const b of $('mldArt').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.art===a));
  $('mldText').placeholder = a==='fehler' ? 'Was ist passiert, was hast du erwartet?' : 'Was fehlt dir, und wofür?';
}
function oeffnen(){
  if(!wrap.hidden) return;
  if(typeof hidePop==='function') g(()=>hidePop());
  $('mldWin').hidden=!kannFenster();
  bildPlan=planBild(); bildFenster=null; bildZeigen();
  // Mit offenem Raum zählt der mit; auf dem Startbildschirm sind es nur die
  // Räume der Liste.
  const n=andereRaeume(), alle=n+(offenerRaum()!=null ? 1 : 0);
  $('mldDatenTxt').textContent = alle===0 ? 'App-Zustand mitsenden (Ansicht, Browser)'
    : alle===1 ? 'App-Zustand mitsenden (Raum, Ansicht, Browser)'
    : `App-Zustand mitsenden, mit allen ${alle} Räumen`;
  $('mldDaten').checked=true;
  $('mldOk').checked=false; sendet=false; msg('');
  $('mldSend').textContent='Senden';
  sendSync();
  wrap.hidden=false;
  $('mldText').focus();
}
function schliessen(){ wrap.hidden=true; }
api.oeffnen=oeffnen; api.schliessen=schliessen;
$('mldOpen').onclick=oeffnen;
if($('mldMenu')) $('mldMenu').onclick=oeffnen;
$('mldClose').onclick=schliessen;
$('mldCancel').onclick=schliessen;
// Klick daneben schließt nur, solange nichts geschrieben ist – sonst wäre
// ein verrutschter Klick der Verlust des Textes (der bleibt aber ohnehin bis
// zum Senden stehen).
wrap.addEventListener('pointerdown',e=>{ if(e.target===wrap && !sendet && !$('mldText').value.trim()) schliessen(); });
$('mldArt').onclick=e=>{ const b=e.target.closest('button'); if(b) artSetzen(b.dataset.art); };
$('mldText').oninput=sendSync; $('mldOk').onchange=sendSync;
$('mldImgOn').onchange=()=>{ $('mldImg').style.opacity=$('mldImgOn').checked?'':'.25'; };
$('mldWin').onclick=async()=>{
  const b=await fensterBild();
  if(b){ bildFenster=b; $('mldImgOn').checked=true; $('mldImg').style.opacity=''; }
  else msg('Fenster-Aufnahme abgebrochen oder nicht erlaubt'+(bildPlan ? ' – das Bild der Zeichenfläche bleibt.' : '.'));
  bildZeigen();
};
// Solange der Dialog offen ist, gehören ihm alle Tasten: App-Kürzel (1–4,
// Entf, H …) dürfen dahinter nichts verändern. Esc schließt.
addEventListener('keydown',e=>{
  if(wrap.hidden) return;
  if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); if(!sendet) schliessen(); return; }
  if(!wrap.contains(e.target)) e.stopPropagation();
},true);
wrap.addEventListener('keydown',e=>e.stopPropagation());
// Der offene Dialog hält den Fokus: Tab wandert nicht in die Seite dahinter.
document.addEventListener('focusin', e=>{
  if(wrap.hidden || wrap.contains(e.target)) return;
  const ziel=wrap.querySelector('button, input, textarea, select');
  if(ziel) ziel.focus({preventScroll:true});
});
// Ein modaler <dialog> (Fliese einmessen) macht alles außerhalb inert, egal
// welcher z-index. Solange er offen ist, ziehen Knopf und Meldedialog in ihn
// um, damit „Fehler melden“ auch dort geht; beim Schließen zurück.
for(const dlg of document.querySelectorAll('dialog')){
  const umzug=()=>{
    const ziel = dlg.open && dlg.matches(':modal') ? dlg : document.body;
    if(fab.parentNode!==ziel){ ziel.appendChild(fab); ziel.appendChild(wrap); ziel.appendChild($('mldToast')); }
  };
  new MutationObserver(umzug).observe(dlg,{attributes:true, attributeFilter:['open']});
}

// Nach dem Senden: Dialog zu, Felder leer, kurze Bestätigung mit der
// Meldungsnummer unten links.
function fertig(t){
  sendet=false; $('mldText').value=''; $('mldKontakt').value=''; $('mldOk').checked=false;
  schliessen();
  toast(t);
}

function alsDatei(payload){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));
  a.download=`meldung-lokal-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 10000);
}
$('mldSend').onclick=async()=>{
  if($('mldSend').disabled) return;
  // Ohne Zustand nur Stand und Zeit: der Empfänger verlangt ein Objekt,
  // und die Version braucht es, um den Text einzuordnen.
  const z=$('mldDaten').checked ? zustand(true) : {stand:stand(), zeit:new Date().toISOString(), ohneDaten:true, undo:[], redo:[]};
  const payload={ v:1, art, text:$('mldText').value.trim(), kontakt:$('mldKontakt').value.trim()||null,
    einwilligung:true, bild:$('mldImgOn').checked ? (bildFenster||bildPlan) : null, zustand:z };
  // Obergrenze des Empfängers ist 15 MB: notfalls zuerst den Rückgängig-
  // Verlauf kürzen (älteste zuerst), der ist am ehesten verzichtbar.
  let body=JSON.stringify(payload);
  while(body.length>14e6 && (z.undo.length || z.redo.length)){
    if(z.undo.length) z.undo.splice(0, Math.max(1, z.undo.length>>1)); else z.redo.length=0;
    z.undoGekuerzt=true; body=JSON.stringify(payload);
  }
  if(body.length>14e6){ msg('Die Meldung ist zu groß (über 14 MB). Bild oder App-Zustand weglassen.','bad'); return; }
  sendet=true; sendSync(); $('mldSend').textContent='Sendet …'; msg('');
  let r=null, j=null;
  try{
    r=await fetch('bugreport.php',{method:'POST', headers:{'Content-Type':'application/json'}, body, credentials:'same-origin'});
    j=await r.json().catch(()=>null);
  }catch(e){ r=null; }
  if(r && r.ok && j && j.ok){ fertig(`Danke. Meldung ${j.id} ist angekommen.`); return; }
  sendet=false; $('mldSend').textContent='Senden'; sendSync();
  const live=/(^|\.)irazari-te\.ch$/.test(location.hostname);
  if(!live && (!r || [404,405,501].includes(r.status))){
    alsDatei(payload);
    fertig('Lokale Fassung ohne Empfänger: Meldung als Datei gesichert.');
    return;
  }
  msg(j && j.fehler ? `Senden fehlgeschlagen: ${j.fehler}` : `Senden fehlgeschlagen${r?` (Status ${r.status})`:' (keine Verbindung)'}. Bitte später noch einmal versuchen.`,'bad');
};

// --- Nachstellen (nur lokal): raumaufmass.html?meldung=bugreports/<datei>.json
// ersetzt die Räume dieses Browsers durch die der Meldung, lädt neu und
// stellt danach Raum, Ansicht, Auswahl und Rückgängig wieder her. Nur in einem
// Werkzeug, das einen Raum öffnen und zeichnen kann; sonst bleibt es aus.
const lokal=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const kannNachstellen=()=>hatModell() && hatSpeicher()
  && typeof serialize==='function' && typeof deserialize==='function'
  && typeof recompute==='function' && typeof render==='function'
  && typeof openRoom==='function' && typeof setMode==='function'
  && typeof undoStack!=='undefined' && typeof redoStack!=='undefined'
  && typeof currentRoom!=='undefined';
const q=new URLSearchParams(location.search).get('meldung');
if(lokal && q && !kannNachstellen()) hinweisLive('Nachstellen geht nur im Raumaufmaß (raumaufmass.html?meldung=…).');
if(lokal && q && kannNachstellen()){
  (async()=>{
    let o;
    try{ o=await (await fetch(q,{cache:'no-store'})).json(); }
    catch(e){ hinweisLive(`Meldung ${q} nicht lesbar: ${e.message}`); return; }
    const z=o && o.zustand;
    if(z && z.ohneDaten){ hinweisLive(`Meldung ${o.id||q} ohne App-Zustand, nichts nachzustellen: „${String(o.text||'').slice(0,200)}“`); return; }
    if(!z || !z.speicher){ hinweisLive(`${q} ist keine Meldung.`); return; }
    if(!confirm(`Meldung ${o.id||q} nachstellen?\n\n„${String(o.text||'').slice(0,300)}“\n\nDas ersetzt ALLE Räume dieses Browsers (${location.host}) durch die aus der Meldung.`)) return;
    try{
      for(const k of Object.keys(localStorage)) if(k.startsWith('raumaufmass')) localStorage.removeItem(k);
      for(const [k,v] of Object.entries(z.speicher)) if(k.startsWith('raumaufmass') && typeof v==='string') localStorage.setItem(k,v);
    }catch(e){ hinweisLive('localStorage nicht beschreibbar: '+e.message); return; }
    if(!ss.set(K_NACH, JSON.stringify({id:o.id||q, ui:z.ui, raum:z.raum, undo:z.undo, redo:z.redo}))){ hinweisLive('sessionStorage nicht beschreibbar.'); return; }
    location.replace(location.pathname);
  })();
}
const nach=ss.get(K_NACH);
if(lokal && nach && kannNachstellen()){
  ss.del(K_NACH);
  try{
    const o=JSON.parse(nach), u=o.ui||{};
    if(u.currentRoom && u.currentRoom!==currentRoom && STORE.load(u.currentRoom)) openRoom(u.currentRoom);
    if(o.raum && serialize()!==JSON.stringify(o.raum)){ deserialize(o.raum); recompute(); }
    undoStack.length=0; undoStack.push(...(o.undo||[]));
    redoStack.length=0; redoStack.push(...(o.redo||[]));
    // Fliesenplan und Küchenplaner sind eigene Werkzeuge: der Schritt allein führte zurück ins Aufmaß.
    if(u.mode && u.mode!==M.mode){ const w={tiles:'fliesen', kitchen:'kueche'}[u.mode]; if(w && typeof setTool==='function') setTool(w); else setMode(u.mode); }
    // Nach openRoom/deserialize/setMode: openRoom setzt die Küchenauswahl zurück.
    if(u.kueche && typeof kitchenUiRestore==='function') kitchenUiRestore(u.kueche);
    if(Array.isArray(u.sel)) M.sel=u.sel;
    M.chain=u.chain??null; M.wallSel=u.wallSel??null; M.openSel=u.openSel??null;
    // Ab hier Namen der heutigen Bedienung: jeder nur, wenn es ihn gibt.
    if(u.ts && typeof TS!=='undefined'){ TS.tool=u.ts.tool||TS.tool; TS.sel=new Set(u.ts.sel||[]); }
    if(u.activeTileId!==undefined && typeof activeTileId!=='undefined') activeTileId=u.activeTileId;
    if(typeof u.unfoldOn==='boolean' && typeof unfoldOn!=='undefined' && u.unfoldOn!==unfoldOn && $('unfold')) $('unfold').click();
    if(typeof u.showEllipses==='boolean' && typeof showEllipses!=='undefined' && u.showEllipses!==showEllipses && $('ellipses')) $('ellipses').click();
    // Die Ansicht nur übernehmen, wenn der Nutzer sie selbst gestellt hatte;
    // sonst war sie eingepasst und wird es hier auch.
    if(u.VIEW && u.userView && typeof VIEW!=='undefined' && typeof userView!=='undefined'){ VIEW={...VIEW,...u.VIEW}; userView=true; }
    if(u.WV && u.wallUserView && typeof WV!=='undefined' && typeof wallUserView!=='undefined'){ WV={...WV,...u.WV}; wallUserView=true; }
    render();
    hinweisLive(`Meldung ${o.id} nachgestellt (Modus ${u.mode}). Die Ansicht stammt vom Gerät des Nutzers – 0 passt ein.`);
  }catch(e){ hinweisLive('Nachstellen fehlgeschlagen: '+e.message); console.error(e); }
}
}

aufbauen();
})();
