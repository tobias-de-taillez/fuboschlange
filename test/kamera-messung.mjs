// Selbsttest der Messseite kamera-messung.html (Doku 12.7). Der Skriptblock "messung" laeuft in node:vm gegen
// Attrappen von Kameras (getUserMedia, enumerateDevices, MediaStreamTrack, ImageCapture, requestVideoFrameCallback),
// WebXR (Sitzung, XR-Bilder, Posen, Projektionsmatrix, XRWebGLBinding), WebGL2 (readPixels liefert eine steuerbare
// Kachel), DOM und localStorage, mit fester Uhr und virtueller Zeit (Muster: geraet() in test/raumskizze-probe.mjs).
// Die Wahrheit steht im Szenario: Sichtfeld der Projektion, ob die Kachel steht, was getUserMedia neben AR tut,
// wann gedreht wird. Eine Abweichung hier liegt an der Seite, nicht am Telefon. Abschnitt 4b haelt die Faelle der
// Gegenpruefung (S1-S9: Teilstoerungen, Standbild waehrend getUserMedia aussteht, nie getrackt, rVFC stumm) als Checks.
//
//   node test/kamera-messung.mjs            # KAMERA_MESSUNG_HTML=pfad prueft einen anderen Stand der Seite
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Blob as NodeBlob, File as NodeFile} from 'node:buffer';

const HTML=readFileSync(process.env.KAMERA_MESSUNG_HTML || new URL('../kamera-messung.html', import.meta.url), 'utf8');
const mS=HTML.match(/<script id="messung">([\s\S]*?)<\/script>/);
if(!mS) throw new Error('Script-Block "messung" nicht gefunden');
const SRC=mS[1], MARKUP=HTML.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
// Elemente der Seite mit Tag, Klassen, disabled; getElementById auf eine andere id zaehlt als Fehler der Seite.
const ELEM=new Map(), ELTERN=[];
{ const stapel=[];
  for(const x of MARKUP.matchAll(/<(\/?)(\w+)\b([^>]*)>/g)){
    const zu=x[1]==='/', tag=x[2].toLowerCase();
    if(['meta', 'br', 'input', 'title', 'style'].includes(tag)) continue;
    if(zu){ stapel.pop(); continue; }
    const id=x[3].match(/\bid="([^"]+)"/), cl=x[3].match(/\bclass="([^"]*)"/);
    if(id){ ELEM.set(id[1], {tag, cls:cl ? cl[1].split(/\s+/).filter(Boolean) : [], disabled:/\sdisabled\b/.test(x[3])});
      const vater=[...stapel].reverse().find(Boolean); if(vater) ELTERN.push([id[1], vater]); }
    stapel.push(id ? id[1] : null);
  } }

const out=[]; let ok=true;
const chk=(name, cond, info='')=>{ ok=ok&&!!cond; out.push((cond?'ok   ':'ROT  ')+name+(info!==''?'  ('+info+')':'')); };
const nah=(a, b, tol)=>Number.isFinite(a) && Math.abs(a-b)<=tol;
const UNBEHANDELT=[];
process.on('unhandledRejection', e=>UNBEHANDELT.push(String(e && e.stack || e)));
const D2R=Math.PI/180;

// Projektion wie XRView.projectionMatrix (spaltenweise) aus dem Sichtfeld horizontal/vertikal in Grad, mittig
const proj=(h, v, n=0.1, f=100)=>[1/Math.tan(h*D2R/2),0,0,0, 0,1/Math.tan(v*D2R/2),0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0];
// schiefes Frustum: Winkel links, rechts, unten, oben (Grad) von der Blickachse
// Viewer-Pose um die Blickachse gerollt (Grad), spaltenweise
const rotZ=g=>{ const c=Math.cos(g*D2R), s=Math.sin(g*D2R); return Float32Array.from([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); };
const projSchief=(l, r, u, o, n=0.1, f=100)=>{ const L=-Math.tan(l*D2R), R=Math.tan(r*D2R), U=-Math.tan(u*D2R), O=Math.tan(o*D2R);
  return [2/(R-L),0,0,0, 0,2/(O-U),0,0, (R+L)/(R-L),(O+U)/(O-U),(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]; };

// Kameras der Attrappe (Wahrheit der Attrappe, nicht des Geraets): Rueckkamera wie laut Recherche (zoom ab 1,
// zoom in getCapabilities nur mit Anfrage zoom:true), Frontkamera belegt, zweite Rueckkamera ohne zoom-Rechte.
const KAM0={id:'id-rueck-0', label:'camera 0, facing back', facing:'environment', aufl:[4000, 3000], foto:[4080, 3072], captureTime:true, erstesMs:120, zoomNurMitAnfrage:true,
  caps:{width:{min:1, max:4080}, height:{min:1, max:3072}, aspectRatio:{min:0.0003, max:4080}, frameRate:{min:1, max:30}, facingMode:['environment'],
    resizeMode:['none', 'crop-and-scale'], zoom:{min:1, max:10, step:0.1}}};
const KAM1={id:'id-front-1', label:'camera 1, facing front', facing:'user', aufl:[1920, 1080], foto:[3648, 2736], fehler:{name:'NotReadableError', message:'Could not start video source'},
  caps:{width:{min:1, max:3648}, height:{min:1, max:2736}, facingMode:['user']}};
const KAM2={id:'id-rueck-2', label:'camera 2, facing back', facing:'environment', aufl:[1920, 1440], foto:[4000, 3000], erstesMs:80, fotoHaengt:true,
  fehlerMitZoom:{name:'OverconstrainedError', message:'', constraint:'zoom'},
  caps:{width:{min:1, max:4000}, height:{min:1, max:3000}, facingMode:['environment'], frameRate:{min:1, max:30}}};
const RUECK0=JSON.stringify([{id:KAM0.id, label:KAM0.label}]);

// Auszug aus der Chromium-Liste fuer Web Share (ShareServiceImpl.java, PERMITTED_EXTENSIONS/MIME_TYPES, Tag 155.0.8059.87)
const TEILBAR_ENDUNG=['csv', 'pdf', 'png', 'jpg', 'jpeg', 'txt', 'text', 'html', 'htm'], TEILBAR_TYP=['text/plain', 'text/csv', 'text/html', 'application/pdf', 'image/png', 'image/jpeg'];

// ------------------------------------------------------------------ nachgebautes Geraet
async function seite(o={}){
  let uhr=1000, seq=0, tid=0;
  const aufg=[];
  const plane=(due, fn)=>{ const a={id:++tid, due, seq:seq++, fn}; aufg.push(a); return a.id; };
  const weg=id=>{ const i=aufg.findIndex(a=>a.id===id); if(i>=0) aufg.splice(i, 1); };
  const leer=()=>new Promise(r=>setImmediate(r));
  const stat={fehler:[], gum:[], anfragen:[], readPixels:0, kachel:null, downloads:[], geteilt:[], fremd:new Set(), xrBilder:0, ohneGeste:0, texLiegt:0, urls:new Map()};
  const lauf=async bis=>{
    for(;;){ await leer();
      let b=null; for(const a of aufg) if(!b || a.due<b.due || (a.due===b.due && a.seq<b.seq)) b=a;
      if(!b || b.due>bis) break;
      aufg.splice(aufg.indexOf(b), 1); uhr=Math.max(uhr, b.due);
      try{ b.fn(); }catch(e){ stat.fehler.push(String(e && e.stack || e)); } }
    uhr=Math.max(uhr, bis); await leer(); };
  const quer0=(o.ausrichtung || 'portrait-primary').startsWith('landscape');
  const H={geste:false, ori:{type:o.ausrichtung || 'portrait-primary', angle:quer0 ? 90 : 0}, sitzung:null, stoerung:null, xrBild:0, spuren:[], roll:0, einmal:new Set(), stopps:[],
    recht:o.recht || 'granted', rechtPtz:o.rechtPtz || o.recht || 'granted', rechtH:[]};
  const fehler=(name, message, constraint)=>Object.assign(new Error(message || name), {name, ...(constraint ? {constraint} : {})});

  // ---- DOM
  class El{
    constructor(tag, id=''){ this.tagName=String(tag).toUpperCase(); this.id=id; this._t=''; this.children=[]; this.parentNode=null; this.className=''; this.disabled=false;
      this.style={}; this.h={}; this.cl=new Set(); const me=this;
      this.classList={add:(...c)=>c.forEach(x=>me.cl.add(x)), remove:(...c)=>c.forEach(x=>me.cl.delete(x)), contains:c=>me.cl.has(c),
        toggle:(c, an)=>{ if(an===undefined) an=!me.cl.has(c); if(an) me.cl.add(c); else me.cl.delete(c); return an; }}; }
    get textContent(){ return this._t+this.children.map(c=>c.textContent).join(''); }
    set textContent(v){ this._t=String(v); for(const c of this.children) c.parentNode=null; this.children=[]; }
    appendChild(c){ if(c.parentNode){ const a=c.parentNode.children, i=a.indexOf(c); if(i>=0) a.splice(i, 1); } c.parentNode=this; this.children.push(c); return c; }
    append(...cs){ for(const c of cs) this.appendChild(typeof c==='string' ? Object.assign(new El('#text'), {_t:c}) : c); }
    replaceChildren(...cs){ for(const c of this.children) c.parentNode=null; this.children=[]; this.append(...cs); }
    remove(){ if(this.parentNode){ const a=this.parentNode.children; a.splice(a.indexOf(this), 1); this.parentNode=null; } }
    addEventListener(t, f){ (this.h[t]=this.h[t] || []).push(f); }
    removeEventListener(t, f){ const a=this.h[t]; if(a && a.includes(f)) a.splice(a.indexOf(f), 1); }
    click(){ if(this.tagName==='A'){ stat.downloads.push({href:this.href, download:this.download}); return; } if(this.onclick) this.onclick({}); }
    getContext(k){ return k==='webgl2' && !o.ohneGL ? gl : null; }
  }
  // Video: requestVideoFrameCallback feuert, solange die Spur live ist und liefert (erstes Bild nach erstesMs, dann 30 Hz);
  // o.rvfcStumm: rVFC feuert nie (Video im Overlay nicht gezeichnet), die Spur liefert trotzdem. getVideoPlaybackQuality
  // und currentTime zaehlen die Quellbilder der Spur, unabhaengig vom Zeichnen (o.ohneQualitaet: fehlt).
  class Video extends El{
    constructor(id){ super('video', id); this._src=null; this.muted=false; this.playsInline=false;
      // o.qualitaetGezeichnet: Qualitaet zaehlt nur gezeichnete Bilder (wie rVFC) - so koennte Chrome es auch tun
      if(!o.ohneQualitaet) this.getVideoPlaybackQuality=()=>({totalVideoFrames:!this._spur() ? 0 : o.qualitaetGezeichnet ? this._spur().bildNr : this._spur().quelle(), droppedVideoFrames:0}); }
    _spur(){ return this._src && this._src.getVideoTracks()[0]; }
    get currentTime(){ return this._spur() ? this._spur().quelle()/30 : 0; }
    get srcObject(){ return this._src; } set srcObject(s){ this._src=s; }
    play(){ return Promise.resolve(); }
    requestVideoFrameCallback(cb){ if(o.rvfcStumm) return 1; const s=this._src, v=this, tr0=s && s.getVideoTracks()[0];
      const pruef=()=>{ if(v._src!==s || !s) return; const tr=s.getVideoTracks()[0]; if(!tr || tr.readyState!=='live') return;
        if(!tr.liefert){ plane(uhr+33, pruef); return; }
        tr.bildNr++;
        cb(uhr, {presentationTime:uhr, expectedDisplayTime:uhr+16, width:tr.settings.width, height:tr.settings.height, mediaTime:tr.bildNr/30,
          presentedFrames:tr.bildNr, processingDuration:0.005, ...(tr.dev.captureTime ? {captureTime:uhr-28} : {})}); };
      plane(uhr+(tr0 && tr0.bildNr===0 ? (tr0.dev.erstesMs ?? 100) : 33), pruef); return 1; }
  }
  const neu=(tag, id)=>String(tag).toLowerCase()==='video' ? new Video(id) : new El(tag, id);
  const els=new Map();
  for(const [id, e] of ELEM){ const x=neu(e.tag, id); e.cls.forEach(c=>x.cl.add(c)); x.disabled=e.disabled; els.set(id, x); }
  for(const [k, v] of ELTERN) els.get(v).appendChild(els.get(k));
  const body=new El('body');
  const docH={};
  const document={getElementById:id=>{ if(!els.has(id)){ stat.fremd.add(id); els.set(id, new El('div', id)); } return els.get(id); },
    createElement:tag=>neu(tag), body, visibilityState:'visible', addEventListener:(t, f)=>{ (docH[t]=docH[t] || []).push(f); }};

  // ---- WebGL2: readPixels liefert die Kachel des aktuellen XR-Bilds (Inhalt aus H.xrBild, steht bei Stoerung still)
  const K={}; let kn=0x8000; const konst=n=>K[n] ?? (K[n]=++kn);
  const fbs=[]; let fbJetzt=null;
  const gl=new Proxy({
    makeXRCompatible:()=>o.haengt==='makeXRCompatible' ? new Promise(()=>{}) : Promise.resolve(),
    createFramebuffer:()=>{ const f={fb:true, tex:null}; fbs.push(f); return f; },
    bindFramebuffer:(t, fb)=>{ fbJetzt=fb; },
    framebufferTexture2D:(t, a, tt, tex)=>{ if(fbJetzt && fbJetzt.fb) fbJetzt.tex=tex; },
    checkFramebufferStatus:()=>konst('FRAMEBUFFER_COMPLETE'),
    readPixels:(x, y, w, h, f, ty, dst)=>{ stat.readPixels++; stat.kachel=[x, y, w, h];
      const tex=fbJetzt && fbJetzt.fb ? fbJetzt.tex : null;
      if(!tex || !tex.kamera){ dst.fill(0); stat.leerGelesen=(stat.leerGelesen || 0)+1; return; }
      for(let i=0;i<dst.length;i++) dst[i]=(i&3)===3 ? 255 : tex.schwarz ? 1 : tex.hell ? 255 : (tex.bild*37+i*11+((tex.bild*(i>>2))&7))&255; }},
    {get:(ob, k)=>k in ob ? ob[k] : typeof k==='string' && /^[A-Z0-9_]+$/.test(k) ? konst(k) : ()=>{}});

  // ---- Kameras
  const KAM=o.kameras || [KAM0, KAM1];
  class Spur{
    constructor(dev, c){ const v=c && typeof c.video==='object' ? c.video : {};
      Object.assign(this, {kind:'video', dev, label:dev.label, readyState:'live', muted:false, enabled:true, _liefert:true, _seit:uhr, _fr:0, bildNr:0, h:{}, zoomFrei:!!v.zoom});
      this.settings={deviceId:dev.id, groupId:'g'+dev.id, width:dev.aufl[0], height:dev.aufl[1], aspectRatio:dev.aufl[0]/dev.aufl[1], frameRate:30,
        facingMode:dev.facing, resizeMode:'none', ...(dev.caps.zoom ? {zoom:1} : {})};
      H.spuren.push(this); }
    // Quellbilder mit 30 Hz, solange die Spur liefert - was die Kamera erzeugt, egal ob jemand zeichnet
    get liefert(){ return this._liefert; }
    set liefert(x){ if(this._liefert && !x) this._fr+=(uhr-this._seit)*0.03; if(!this._liefert && x) this._seit=uhr; this._liefert=!!x; }
    quelle(){ return Math.floor(this._fr+(this._liefert ? (uhr-this._seit)*0.03 : 0)); }
    get stats(){ return o.ohneStats ? undefined : {totalFrames:this.quelle(), deliveredFrames:this.quelle(), discardedFrames:0}; }
    getSettings(){ return {...this.settings}; }
    getCapabilities(){ const c=JSON.parse(JSON.stringify(this.dev.caps)); if(this.dev.zoomNurMitAnfrage && !this.zoomFrei) delete c.zoom; return c; }
    getConstraints(){ return {}; }
    applyConstraints(c){ if(o.haengt==='applyConstraints') return new Promise(()=>{});
      const z=c && c.advanced && c.advanced[0] && c.advanced[0].zoom, cz=this.getCapabilities().zoom;
      return new Promise(ja=>plane(uhr+40, ()=>{ if(z!=null && cz) this.settings.zoom=Math.min(cz.max, Math.max(cz.min, z)); ja(); })); }
    // o.bleibt: AR erholt sich nach dem Stoppen nicht; o.erholMs: erst so viel spaeter
    stop(){ if(this.readyState==='ended') return; this.readyState='ended'; this.liefert=false; H.stopps.push(uhr);
      if(H.stoerung && H.stoerung.spur===this && !o.bleibt){ const st=H.stoerung; if(o.erholMs) plane(uhr+o.erholMs, ()=>{ if(H.stoerung===st) H.stoerung=null; }); else H.stoerung=null; } }
    addEventListener(t, f){ (this.h[t]=this.h[t] || []).push(f); }
    feuern(t){ if(t==='mute') this.muted=true; if(t==='unmute') this.muted=false; if(t==='ended') this.readyState='ended'; for(const f of this.h[t] || []) f({type:t}); }
  }
  const strom=(dev, c)=>{ const tr=new Spur(dev, c); return {id:'strom-'+tr.label, active:true, getTracks:()=>[tr], getVideoTracks:()=>[tr], getAudioTracks:()=>[]}; };
  const waehle=c=>{ const v=c && c.video;
    if(v && typeof v==='object' && v.deviceId){ const id=v.deviceId.exact ?? v.deviceId; return KAM.find(k=>k.id===id) || null; }
    if(v && typeof v==='object' && v.facingMode){ const f=v.facingMode.exact ?? v.facingMode.ideal ?? v.facingMode; return KAM.find(k=>k.facing===f) || KAM[0]; }
    return KAM[0]; };
  // Reaktion auf getUserMedia waehrend einer Sitzung (o.reaktion): beide | eingefroren | ohnePose | aus | schwarz | notreadable | haengt | spaet | endet
  const mediaDevices={
    getUserMedia(c){ stat.gum.push({c:JSON.parse(JSON.stringify(c)), t:uhr, sitzung:!!H.sitzung});
      const ptz=!!(c && c.video && c.video.zoom);
      // Berechtigungsdialog: o.dialogMs spaeter erlaubt (dann 'granted' und change-Ereignis), 'denied' -> NotAllowedError
      if(H.recht==='denied') return new Promise((ja, nein)=>plane(uhr+50, ()=>nein(fehler('NotAllowedError', 'Permission denied'))));
      if(H.recht==='prompt' || (ptz && H.rechtPtz==='prompt')) return new Promise(ja=>plane(uhr+(o.dialogMs ?? 1000), ()=>{
        H.recht='granted'; H.rechtPtz=ptz || H.rechtPtz==='granted' ? 'granted' : H.rechtPtz; for(const f of H.rechtH) f({}); ja(); })).then(()=>mediaDevices.getUserMedia(c));
      return new Promise((ja, nein)=>{
        const dev=waehle(c);
        if(!dev){ plane(uhr+60, ()=>nein(fehler('OverconstrainedError', 'Constraints could not be satisfied.', 'deviceId'))); return; }
        if(H.sitzung){ const r=o.reaktion || 'beide';
          // o.wartenStoerung: AR gestoert, solange getUserMedia aussteht (danach normal)
          if(o.wartenStoerung) H.stoerung={art:o.wartenStoerung, spur:null, warten:true};
          const frei=()=>{ if(H.stoerung && H.stoerung.warten) H.stoerung=null; };
          if(r==='haengt') return;
          if(r==='notreadable'){ plane(uhr+400, ()=>{ frei(); nein(fehler('NotReadableError', 'Could not start video source')); }); return; }
          plane(uhr+(r==='spaet' ? 9000 : o.gumMs ?? 300), ()=>{ frei(); const s=strom(dev, c), tr=s.getVideoTracks()[0];
            if(r==='endet'){ if(H.sitzung) H.sitzung.endeVonAussen(); }
            else if(!['beide', 'spaet'].includes(r) && H.sitzung) H.stoerung={art:r, spur:tr};
            if(o.gumKurzMs!=null) plane(uhr+o.gumKurzMs, ()=>{ tr.liefert=false; });
            ja(s); });
          return; }
        if(o.haengt==='gum') return;
        // fehlerEinmal: die erste Anfrage dieser Kamera per deviceId scheitert (Kamera noch nicht freigegeben)
        const einmal=dev.fehlerEinmal && c.video && c.video.deviceId && !H.einmal.has(dev.id) ? (H.einmal.add(dev.id), dev.fehlerEinmal) : null;
        const fz=einmal || (dev.fehlerMitZoom && c.video && c.video.zoom ? dev.fehlerMitZoom : dev.fehler);
        if(fz){ plane(uhr+80, ()=>nein(fehler(fz.name, fz.message, fz.constraint))); return; }
        // o.vorKurzMs: Strom ohne Sitzung liefert nur so lange (Teil C: Kamera lief vor AR nicht richtig)
        plane(uhr+(dev.ms ?? 200), ()=>{ const st=strom(dev, c); if(o.vorKurzMs!=null) plane(uhr+o.vorKurzMs, ()=>{ st.getVideoTracks()[0].liefert=false; }); ja(st); });
      }); },
    enumerateDevices:()=>Promise.resolve([...KAM.map(k=>({kind:'videoinput', deviceId:k.id, groupId:'g'+k.id, label:k.label})),
      {kind:'audioinput', deviceId:'mikro', groupId:'gm', label:'Mikrofon'}]),
    addEventListener(){}};
  // ImageCapture mit Schnittstellen-Objekten: Getter liegen aufzaehlbar auf dem Prototyp (wie WebIDL), nicht am Objekt
  const PRIV=Symbol('p');
  class Bereich{ constructor(min, max, step){ this[PRIV]=[min, max, step]; } }
  ['min', 'max', 'step'].forEach((k, i)=>Object.defineProperty(Bereich.prototype, k, {get(){ return this[PRIV][i]; }, enumerable:true}));
  class FotoFaehig{ constructor(d){ this[PRIV]=d; } }
  ['imageWidth', 'imageHeight', 'fillLightMode', 'redEyeReduction'].forEach(k=>Object.defineProperty(FotoFaehig.prototype, k, {get(){ return this[PRIV][k]; }, enumerable:true}));
  class ImageCapture{
    constructor(tr){ this.tr=tr; }
    getPhotoCapabilities(){ const d=this.tr.dev; return new Promise(ja=>plane(uhr+50, ()=>ja(new FotoFaehig({imageWidth:new Bereich(160, d.foto[0], 1),
      imageHeight:new Bereich(120, d.foto[1], 1), fillLightMode:['auto', 'off', 'flash'], redEyeReduction:'never'})))); }
    getPhotoSettings(){ const d=this.tr.dev; if(d.fotoHaengt) return new Promise(()=>{});
      return new Promise(ja=>plane(uhr+50, ()=>ja({imageWidth:d.foto[0], imageHeight:d.foto[1], fillLightMode:'auto', redEyeReduction:false}))); }
  }

  // ---- WebXR: Kamera und Projektion je nach Ausrichtung beim Start (Chrome sperrt sie), 30 Hz, Stoerung durch getUserMedia
  class XRWebGLLayer{ constructor(s){ this.s=s; this.framebuffer={schicht:true}; } getViewport(){ const v=this.s.vp; return {x:0, y:0, width:v[0], height:v[1]}; } }
  class XRWebGLBinding{ constructor(s){ this.s=s; } getCameraImage(){ const zs=this.s.zustand(); return zs.ohneBild ? null : {kamera:true, bild:H.xrBild, schwarz:!!zs.schwarz, hell:!!zs.hell}; } }
  const sitzungNeu=()=>{
    const quer=H.ori.type.startsWith('landscape'), hs={}; let cbs=[];
    const s={zu:false, t0:uhr, roll0:H.roll, cam:quer ? [1920, 861] : [861, 1920], vp:quer ? [2400, 1080] : [1080, 2400], proj:quer ? proj(69.6, 34.6) : proj(34.6, 69.6),
      enabledFeatures:o.features || ['local', 'hit-test', 'anchors', 'dom-overlay', 'camera-access', 'plane-detection', 'depth-sensing'],
      domOverlayState:{type:'screen'}, environmentBlendMode:'alpha-blend', depthUsage:'cpu-optimized', depthDataFormat:'luminance-alpha',
      updateRenderState(x){ this.renderState=x; },
      requestReferenceSpace:art=>o.haengt==='requestReferenceSpace' ? new Promise(()=>{}) : Promise.resolve({art}),
      requestHitTestSource:()=>Promise.resolve({quelle:true}),
      requestAnimationFrame(cb){ cbs.push(cb); return cbs.length; },
      addEventListener(t, f){ (hs[t]=hs[t] || []).push(f); },
      end(){ zuMachen(); return Promise.resolve(); },
      endeVonAussen(){ zuMachen(); },
      zustand(){ const st=H.stoerung, zs=o.xrZustand ? o.xrZustand((uhr-s.t0)/1000) : {}; if(!st) return zs;
        return {...zs, ...({eingefroren:{eingefroren:true, fps:15}, ohnePose:{ohnePose:true}, aus:{aus:true}, schwarz:{schwarz:true}, emul:{emul:true},
          langsam:{fps:15}, standbild:{eingefroren:true}}[st.art] || {})}; }};
    const zuMachen=()=>{ if(s.zu) return; s.zu=true; H.sitzung=null; H.stoerung=null;
      plane(uhr+30, ()=>{ for(const f of hs.end || []) f({session:s});
        for(const tr of H.spuren) if(tr.stummDurchAR){ tr.stummDurchAR=false; if(tr.readyState==='live'){ tr.liefert=true; tr.feuern('unmute'); } } }); };
    const tick=()=>{ if(s.zu) return; const zs=s.zustand(); plane(uhr+1000/(zs.fps || 30), tick); if(zs.aus) return;
      // zs.doppelt: Chrome zeichnet doppelt so schnell, wie die Kamera Bilder liefert (jedes zweite XR-Bild gleich)
      if(!zs.eingefroren && !(zs.doppelt && stat.xrBilder%2)) H.xrBild++;
      const view={projectionMatrix:Float32Array.from(s.proj), camera:{width:s.cam[0], height:s.cam[1]}, transform:{}};
      const frame={session:s, getViewerPose:()=>zs.ohnePose ? null : {emulatedPosition:!!zs.emul, views:[view], transform:{matrix:rotZ(o.poseOhneRoll ? 0 : H.roll-s.roll0)}}};
      const c=cbs; cbs=[]; stat.xrBilder++;
      // Schwerkraft in Geraeteachsen (aufrecht hochkant y=+9,81), Rollwinkel absolut: quer gestartet = 90 Grad
      if(!o.ohneBewegung){ const r=(H.roll+(quer0 ? 90 : 0))*D2R; for(const f of winH.devicemotion || []) f({accelerationIncludingGravity:{x:9.81*Math.sin(r), y:9.81*Math.cos(r), z:0.3}}); }
      for(const cb of c){ try{ cb(uhr, frame); }catch(e){ stat.fehler.push('xr: '+String(e && e.stack || e)); } }
      for(const fb of fbs) if(fb.tex && fb.tex.kamera) stat.texLiegt++; };
    plane(uhr+1000/30, tick);
    // Teil C: was ARCore mit einem schon laufenden getUserMedia-Strom macht (o.cReaktion)
    for(const tr of H.spuren) if(tr.readyState==='live'){
      if(o.cReaktion==='stumm'){ tr.stummDurchAR=true; tr.liefert=false; tr.feuern('mute'); }
      if(o.cReaktion==='endet'){ tr.liefert=false; tr.feuern('ended'); } }
    H.sitzung=s; return s;
  };
  const xr={isSessionSupported:m=>Promise.resolve(!o.arNein && m==='immersive-ar'),
    requestSession(mode, init){ stat.anfragen.push({mode, geste:H.geste, t:uhr, optionalFeatures:[...init.optionalFeatures], requiredFeatures:init.requiredFeatures || null,
        root:init.domOverlay && init.domOverlay.root ? init.domOverlay.root.id : null, depthSensing:JSON.parse(JSON.stringify(init.depthSensing || null))});
      if(!H.geste) stat.ohneGeste++;
      return new Promise((ja, nein)=>{ if(o.haengt==='requestSession') return;
        if(o.arFehler){ plane(uhr+(o.arFehlerMs ?? 150), ()=>nein(fehler(o.arFehler, 'The specified session configuration is not supported.'))); return; }
        plane(uhr+(o.arSpaetMs ?? 150), ()=>ja(sitzungNeu())); }); }};

  // ---- Fenster
  const oriH=[], winH={};
  const screen={width:412, height:915, orientation:{get type(){ return H.ori.type; }, get angle(){ return H.ori.angle; }, addEventListener:(t, f)=>{ if(t==='change') oriH.push(f); }}};
  const ls=o.ls || new Map();
  const localStorage={getItem:k=>ls.has(k) ? ls.get(k) : null, setItem:(k, v)=>{ ls.set(k, String(v)); }, removeItem:k=>{ ls.delete(k); }};
  if(o.rueck!=null) ls.set('kamera-messung.rueck', o.rueck);
  const navigator={userAgent:'Mozilla/5.0 (Linux; Android 17; Pixel 9 Pro) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36',
    userAgentData:{brands:[], mobile:true, platform:'Android', getHighEntropyValues:async()=>({platform:'Android', platformVersion:'17.0.0', model:'Pixel 9 Pro',
      fullVersionList:[{brand:'Not)A;Brand', version:'99.0.0.0'}, {brand:'Google Chrome', version:'155.0.8059.87'}]})},
    ...(o.ohneMD ? {} : {mediaDevices}), ...(o.ohneXR ? {} : {xr}),
    ...(o.ohnePermissions ? {} : {permissions:{query:d=>{ stat.rechtFragen=(stat.rechtFragen || 0)+1;
      return Promise.resolve({get state(){ return d && d.panTiltZoom ? H.rechtPtz : H.recht; }, addEventListener:(t, f)=>{ if(t==='change') H.rechtH.push(f); }}); }}}),
    // canShare wie Chrome (ShareServiceImpl.java, Tag 155.0.8059.87): nur erlaubte Endungen und Typen, .json nicht
    canShare:d=>!!(d && d.files && d.files.length && d.files.every(f=>TEILBAR_ENDUNG.includes(String(f.name).split('.').pop()) && TEILBAR_TYP.includes(f.type))),
    share:async d=>{ stat.geteilt.push(d); }};
  const fenster={document, navigator, localStorage, screen, console, location:{href:'https://geraet.test/kamera-messung.html', search:''},
    performance:{now:()=>uhr}, setTimeout:(f, d=0)=>plane(uhr+Math.max(0, +d || 0), f), clearTimeout:id=>weg(id),
    innerWidth:quer0 ? 915 : 412, innerHeight:quer0 ? 412 : 915, devicePixelRatio:2.625, isSecureContext:true,
    addEventListener:(t, f)=>{ (winH[t]=winH[t] || []).push(f); }, removeEventListener(){},
    URL:{createObjectURL:b=>{ const u='blob:'+(stat.urls.size+1); stat.urls.set(u, b); return u; }, revokeObjectURL(){}},
    Blob:NodeBlob, File:NodeFile, XRWebGLLayer, XRWebGLBinding, confirm:()=>true, ...(o.ohneImageCapture ? {} : {ImageCapture})};
  fenster.window=fenster;
  const rollen=g=>{ H.roll+=g; };
  const drehen=typ=>{ const q=typ.startsWith('landscape'), war=H.ori.type.startsWith('landscape'); H.ori={type:typ, angle:q ? 90 : 0}; if(q!==war) H.roll+=q ? 90 : -90;
    if(q!==war){ const w=fenster.innerWidth; fenster.innerWidth=fenster.innerHeight; fenster.innerHeight=w; }
    for(const f of oriH) f({}); for(const f of winH.resize || []) f({}); };
  const ctx=vm.createContext(fenster);
  vm.runInContext(`(()=>{ const D=Date, T=Date.UTC(2026, 9, 26, 12, 0, 0); globalThis.Date=class extends D{ constructor(...a){ super(...(a.length ? a : [T])); } static now(){ return T; } }; })();`, ctx);
  try{ vm.runInContext(SRC, ctx, {filename:'kamera-messung.html#messung'}); }catch(e){ stat.fehler.push('laden: '+String(e && e.stack || e)); }
  const KM=ctx.KAMERA_MESSUNG;
  await lauf(uhr+200);
  // Klick wie ein Finger: deaktivierte oder versteckte Knoepfe tun nichts; H.geste markiert die Nutzergeste
  const klick=id=>{ const e=document.getElementById(id); if(e.disabled || e.cl.has('hidden')) return false; H.geste=true; try{ e.click(); }finally{ H.geste=false; } return true; };
  const bisFertig=async(max=300000)=>{ const t0=uhr; while(KM && KM.laeuft() && uhr-t0<max) await lauf(uhr+250); return {s:(uhr-t0)/1000, fertig:!!KM && !KM.laeuft()}; };
  const text=id=>els.get(id).textContent;
  const verdecken=z=>{ document.visibilityState=z; for(const f of docH.visibilitychange || []) f({}); };
  return {ctx, KM, stat, H, document, els, ls, klick, lauf, bisFertig, drehen, rollen, verdecken, text, aufg, uhr:()=>uhr, laeufe:t=>KM.P.laeufe.filter(L=>L.teil===t)};
}
const sauber=r=>!r.stat.fehler.length && !r.stat.fremd.size;
const sauberInfo=r=>r.stat.fehler.slice(0, 2).join(' | ') || (r.stat.fremd.size ? 'fremde ids: '+[...r.stat.fremd].join(',') : '');
// Nach dem Lauf: keine Zeitgeber mehr offen (Takt, Warten, Fristen, XR-Bilder, Video), Overlay zu, alle Spuren aus
const ruhig=async r=>{ await r.lauf(r.uhr()+5000); return r.aufg.length===0 && r.els.get('ar').cl.has('hidden') && r.H.spuren.every(t=>t.readyState==='ended') && !r.H.sitzung; };

// ------------------------------------------------------------------ 1. reine Rechnung
{
  const r=await seite();
  const KM=r.KM;
  const f1=KM.sichtfeld(proj(34.6, 69.6)), f2=KM.sichtfeld(proj(69.6, 34.6));
  chk('Sichtfeld aus der Projektion: hochkant 34,6° × 69,6°', f1 && nah(f1.h, 34.6, 0.006) && nah(f1.v, 69.6, 0.006) && f1.p8===0, f1 && `${f1.h} × ${f1.v}`);
  chk('Sichtfeld aus der Projektion: quer 69,6° × 34,6°', f2 && nah(f2.h, 69.6, 0.006) && nah(f2.v, 34.6, 0.006), f2 && `${f2.h} × ${f2.v}`);
  const P3=projSchief(30, 40, 20, 25), f3=KM.sichtfeld(P3);
  chk('Sichtfeld schiefes Frustum (30°+40°, 20°+25°) = 70° × 45°, p8/p9 protokolliert', f3 && nah(f3.h, 70, 0.006) && nah(f3.v, 45, 0.006) && nah(f3.p8, P3[8], 1e-4) && f3.p9!==0,
    f3 && `${f3.h} × ${f3.v}, p8 ${f3.p8}`);
  chk('(Testdaten) schiefes Frustum ist so schief, dass 2·atan(1/p0) um mehr als 0,5° daneben laege', Math.abs(2*Math.atan(1/P3[0])/D2R-70)>0.5);
  chk('Sichtfeld ohne Matrix -> null', KM.sichtfeld(null)===null && KM.sichtfeld(new Array(16).fill(0))===null);
  const a=new Uint8Array(16*16*4).map((_, i)=>(i*13)&255), b=a.slice(), c=a.slice(), d=a.slice();
  c[5]^=1; d[3]^=7;
  chk('Kachel-Hash: gleiches Bild gleich, ein Farbwert anders -> anders, Alpha zaehlt nicht',
    KM.kachelHash(a)===KM.kachelHash(b) && KM.kachelHash(a)!==KM.kachelHash(c) && KM.kachelHash(a)===KM.kachelHash(d));
  // Synthetische Takte (je 1 s, 30 Hz) mit bekannter Zeit je Zustand: stoer[i] = {zustand: Sekunden} im Takt i
  const takte=(stoer={}, o2={})=>({xr:Array.from({length:o2.sek ?? 10}, (_, i)=>{ const zt={aus:0, ohnePose:0, emul:0, ohneBild:0, schwarz:0, hell:0, steht:0, live:0};
    let rest=1; for(const [x, w] of Object.entries(stoer[i] || {})){ zt[x]=w; rest-=w; } zt.live=Math.max(0, rest);
    const fps=o2.fps ?? 30, n=Math.round(fps*(1-zt.aus));
    return {t:i+1, d:1, xr:1, n, zt, dtMax:zt.aus ? zt.aus*1000 : 1000/fps, laufMax:zt.steht ? Math.round(zt.steht*30) : 0,
      gum:o2.gum ?? 0, gumS:o2.gumS ?? null, gumQ:o2.gumQ ?? null}; })});
  const je=(von, bis, x, w=1)=>Object.fromEntries(Array.from({length:bis-von}, (_, i)=>[von+i, {[x]:w}]));
  const fz=(L, a=0, b=10)=>KM.fenster(L, a, b);
  const zs=[[takte(), 'laeuft'], [takte(je(2, 8, 'steht')), 'eingefroren'], [takte({3:{steht:0.6}}), 'laeuft'], [takte(je(1, 5, 'aus')), 'unterbrochen'],
    [takte(je(1, 7, 'aus')), 'aus'], [takte({...je(1, 5, 'ohnePose'), 5:{ohnePose:0.9}}), 'unterbrochen'], [takte(je(1, 7, 'ohnePose')), 'ohne-pose'],
    [takte(je(1, 7, 'emul')), 'emuliert'], [takte(je(1, 7, 'schwarz')), 'schwarz'], [takte(je(1, 7, 'ohneBild')), 'ohne-bild'], [takte(je(1, 7, 'hell')), 'hell'],
    [takte({}, {fps:15}), 'langsam'], [{xr:[]}, 'ohne-sitzung']];
  const zf=zs.filter(([L, w])=>fz(L).zustand!==w);
  chk('Fenster/xrZustand aus Zeit je Zustand: laeuft, eingefroren, 0,6 s Haenger laeuft, 4 s aus unterbrochen, 6 s aus, 4,9 s ohne Pose unterbrochen, ohne Pose, emuliert, schwarz, ohne Bild, hell, langsam, ohne Sitzung',
    !zf.length, zf.map(([L, w])=>w+'->'+fz(L).zustand).join(', '));
  const kh=fz(takte({3:{steht:0.6}})), un=fz(takte(je(1, 5, 'aus')));
  chk('Fenster: kurzer Haenger als Zahl und Merker, Stoerung in Sekunden', kh.kurzerHaenger===true && kh.stoer===0.6 && kh.zt.steht===0.6 && un.stoer===4 && un.zt.aus===4 && !un.kurzerHaenger,
    `${kh.stoer} s, ${un.stoer} s`);
  const st=['laeuft', 'langsam', 'unterbrochen', 'eingefroren', 'aus', 'hell', 'ohne-sitzung'].map(KM.stufe).join();
  chk('Stufe: laeuft ok, langsam/unterbrochen teils (nie laeuft), Stoerungen weg, hell/ohne Sitzung unklar', st==='ok,teils,teils,weg,weg,unklar,unklar', st);
  const g27=fz(takte({}, {gum:2.7})), g30=fz(takte({}, {gum:30})), gS=fz(takte({}, {gum:0, gumS:30, gumQ:29})), g0=fz(takte({}, {gum:0}));
  chk('gUM liefert: erst ab 10 B/s (27 Bilder in 10 s nein), staerkster Zaehler zaehlt (stats); „nein“ nur mit track.stats oder stummer Spur, sonst kein Urteil',
    KM.gumLiefert(g27, null)===false && KM.gumLiefert(g30, null)===true && KM.gumLiefert(gS, {readyState:'live', muted:false})===true && gS.gumQuelle==='stats'
    && KM.gumLiefert(g0, {readyState:'live', muted:false})===null && KM.gumLiefert(g0, {readyState:'ended', muted:false})===false
    && KM.gumLiefert(fz(takte({}, {gum:0, gumS:0})), {readyState:'live', muted:false})===false
    && KM.gumLiefert(fz(takte({}, {gum:0, gumQ:0})), {readyState:'live', muted:false})===null && KM.gumLiefert(fz(takte({}, {gum:0, gumQ:0})), {readyState:'live', muted:true})===false,
    `${g27.gumRate}, ${gS.gumRate}/${gS.gumQuelle}`);
  const lauf=fz(takte({}, {gum:30})), vEin=x=>KM.einordnen({ergebnis:'ok', vorher:lauf, waehrend:lauf, gumHalb:lauf, danachEnde:lauf, gum:{readyState:'live', muted:false}, ...x});
  const ea=vEin({}), eb=vEin({vorher:fz(takte(je(0, 10, 'ohnePose')))}), ec=vEin({waehrend:fz(takte({}, {fps:15, gum:30}))}), ed=vEin({danachEnde:fz(takte(je(0, 3, 'aus')))});
  chk('einordnen: beide laufen; AR lief vorher nicht -> ar-lief-vorher-nicht (ohneVorher bleibt); langsam -> gum-stoert-ar; erholt aus den letzten Sekunden',
    ea.klasse==='beide-laufen' && ea.erholt===true && eb.klasse==='ar-lief-vorher-nicht' && eb.ohneVorher==='beide-laufen' && ec.klasse==='gum-stoert-ar' && ed.erholt===false,
    [ea, eb, ec, ed].map(e=>e.klasse+'/'+e.erholt).join(', '));
  const farben={'beide-laufen':'ok', 'gum-scheitert-ar-laeuft':'ok', 'gum-haengt-ar-laeuft':'ok', 'gum-ohne-bild-ar-laeuft':'warn', 'kein-urteil':'warn',
    'ar-lief-vorher-nicht':'warn', 'gum-stoert-ar':'bad', 'gum-verdraengt-ar':'bad', 'beide-gestoert':'bad', 'gum-haengt-ar-gestoert':'bad', 'gum-scheitert-ar-gestoert':'bad',
    'ar-endet':'bad', 'ar-verdraengt-gum':'bad', 'ar-scheitert':'warn', 'gum-scheitert':'warn', 'gum-lief-vorher-nicht':'warn', 'beide-laufen-ar-langsam':'warn'};
  const ff=Object.entries(farben).filter(([k, w])=>KM.klasseFarbe(k)!==w);
  chk('Farbe je Klasse aus fester Tabelle (unbekannte Klasse gelb, nicht gruen per Praefix)', !ff.length, ff.map(([k, w])=>k+':'+KM.klasseFarbe(k)).join(', '));
  // frist: rechtzeitig, nie, zu spaet (dann raeumt spaet() auf)
  let w1=null, e2=null, e3=null, spaet=null;
  KM.frist(new Promise(ja=>r.ctx.setTimeout(()=>ja(7), 100)), 500, 'a').then(x=>{ w1=x; });
  KM.frist(new Promise(()=>{}), 500, 'b').catch(e=>{ e2=e; });
  KM.frist(new Promise(ja=>r.ctx.setTimeout(()=>ja('spaet'), 800)), 500, 'c', x=>{ spaet=x; }).catch(e=>{ e3=e; });
  KM.frist(()=>{ throw new Error('sofort'); }, 500, 'd').catch(()=>{});
  await r.lauf(r.uhr()+1000);
  chk('frist: rechtzeitig -> Wert, nie -> Zeitgrenze, zu spaet -> Zeitgrenze und Aufraeumen',
    w1===7 && e2 && e2.name==='Zeitgrenze' && e3 && e3.name==='Zeitgrenze' && spaet==='spaet', `${w1}, ${e2 && e2.name}, ${spaet}`);
  class Iface{} Object.defineProperty(Iface.prototype, 'max', {get(){ return 9; }, enumerable:true}); Object.defineProperty(Iface.prototype, 'f', {value(){}, enumerable:true});
  const kp=KM.kopie({r:new Iface(), l:['a'], n:Infinity});
  chk('kopie: Schnittstelle mit Prototyp-Gettern, ohne Funktionen, JSON-sicher', JSON.stringify(kp)==='{"r":{"max":9},"l":["a"],"n":"Infinity"}', JSON.stringify(kp));
  const ar=KM.ausrichtungAuswerten([{t:0, typ:'portrait-primary', cam:[861, 1920], vp:[1080, 2400], fov:[34.6, 69.6]}, {t:2, typ:'landscape-primary', cam:[1920, 861], vp:[2400, 1080], fov:[69.6, 34.6]}]);
  chk('ausrichtungAuswerten: Kamera folgt der Drehung -> Kamera-, Viewport-, Sichtfeldwechsel', ar && ar.drehung && ar.kameraWechsel && ar.viewportWechsel && ar.sichtfeldWechsel);
  const rl=[0, 30, 90, -90, 179].map(g=>KM.rollen(rotZ(g)));
  chk('Rollwinkel aus der Viewer-Pose: 0, 30, 90, -90, 179 Grad; Blick senkrecht -> null', JSON.stringify(rl)==='[0,30,90,-90,179]'
    && KM.rollen(Float32Array.from([1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1]))===null, JSON.stringify(rl));
  const gs=KM.ausrichtungAuswerten([{t:0, typ:'landscape-primary', cam:[1920, 861], vp:[2400, 1080], fov:[69.6, 34.6], roll:170}, {t:2, typ:'landscape-primary', cam:[1920, 861], vp:[2400, 1080], fov:[69.6, 34.6], roll:-100}]);
  chk('ausrichtungAuswerten: Telefon gedreht, Bildschirm gesperrt -> physischGedreht ohne drehung (ueber ±180 gerechnet)', gs && gs.physischGedreht===true && gs.drehung===false
    && gs.rollMax===90 && !gs.kameraWechsel, gs && `${gs.rollMax}°`);
  chk('Seite laedt sauber (keine Ausnahme, alle ids im Markup)', sauber(r), sauberInfo(r));
  chk('Kopf: Geraet und Browser aus userAgentData', r.KM.KOPF.modell==='Pixel 9 Pro' && r.KM.KOPF.browser==='Google Chrome 155.0.8059.87' && /Pixel 9 Pro/.test(r.text('kopf')),
    `${r.KM.KOPF.modell} · ${r.KM.KOPF.browser}`);
  chk('Kopf: DPR, Fenster, Ausrichtung, sicherer Kontext, immersive-ar', r.KM.KOPF.dpr===2.625 && r.KM.KOPF.inner.join('x')==='412x915' && r.KM.KOPF.ausrichtung==='portrait-primary'
    && r.KM.KOPF.sicher===true && r.KM.KOPF.ar===true && /unterstützt/.test(r.text('kopf')));
}

// ------------------------------------------------------------------ 2. ohne WebXR, ohne mediaDevices
{
  const r=await seite({ohneXR:true, ohneMD:true});
  const k=r.KM.KOPF, dis=['btnA', 'btnB', 'btnC', 'btnDq', 'btnDh'].every(id=>r.els.get(id).disabled);
  chk('ohne WebXR/mediaDevices: laedt ohne Ausnahme und meldet es', sauber(r) && k.webxr===false && k.mediaDevices===false && /WebXR fehlt/.test(r.text('kopf'))
    && /getUserMedia\s*fehlt/.test(r.text('kopf')) && /fehlen getUserMedia und WebXR/.test(r.text('status')), sauberInfo(r) || r.text('status'));
  chk('ohne WebXR/mediaDevices: alle Teile gesperrt, Klick tut nichts', dis && !r.klick('btnA') && !r.klick('btnB'));
  r.KM.starte.A(); await r.bisFertig();
  r.KM.starte.B(); await r.bisFertig();
  r.KM.starte.C(); await r.bisFertig();
  const [A]=r.laeufe('A'), [B]=r.laeufe('B'), [C]=r.laeufe('C');
  chk('ohne WebXR/mediaDevices: Teile laufen trotzdem sauber durch und protokollieren den Grund',
    A && A.fertig && A.fehler[0] && A.fehler[0].name==='NotSupportedError' && B && B.fertig && B.sitzungOk===false && B.sitzungFehler.name==='NotSupportedError'
    && C && C.fertig && C.fehler[0] && C.fehler[0].name==='NotSupportedError' && sauber(r), `${A && JSON.stringify(A.fehler)} ${B && JSON.stringify(B.sitzungFehler)}`);
  const r2=await seite({arNein:true});
  chk('immersive-ar nicht unterstuetzt: nur Teil A frei', sauber(r2) && r2.KM.KOPF.ar===false && !r2.els.get('btnA').disabled && r2.els.get('btnB').disabled
    && r2.els.get('btnC').disabled && r2.els.get('btnDq').disabled && /nicht unterstützt/.test(r2.text('kopf')));
}

// ------------------------------------------------------------------ 3. Teil A
{
  const r=await seite({kameras:[KAM0, KAM1, KAM2]});
  chk('Teil A: Knopf frei, Klick startet', r.klick('btnA'));
  const z=await r.bisFertig();
  const [L]=r.laeufe('A'), k=L ? L.kameras : [];
  const [k0, k1, k2]=k;
  chk('Teil A: fertig, drei Kameras (ohne Mikrofon), erste Anfrage {video:true} fuer die Labels', z.fertig && L.fertig && k.length===3 && L.geraete.length===3
    && JSON.stringify(r.stat.gum[0].c)==='{"video":true}' && L.erst.label==='camera 0, facing back', `${z.s} s`);
  const g1=r.stat.gum[1].c.video, g2=r.stat.gum[2].c.video;
  chk('Teil A: je Kamera deviceId exact, Wunsch 4000×3000, einmal mit zoom:true, einmal ohne',
    g1.deviceId.exact===KAM0.id && g1.width.ideal===4000 && g1.height.ideal===3000 && g1.zoom===true && g2.deviceId.exact===KAM0.id && !('zoom' in g2), JSON.stringify(g1));
  chk('Teil A: Faehigkeiten camera 0 (zoom 1–10 nur mit Anfrage, 4080×3072, facing, resizeMode, frameRate)',
    k0 && k0.mitZoom.ok && k0.mitZoom.capabilities.zoom.min===1 && k0.mitZoom.capabilities.zoom.max===10 && k0.ohneZoom.ok && k0.ohneZoom.capabilities.zoom===undefined
    && k0.mitZoom.capabilities.width.max===4080 && k0.mitZoom.capabilities.height.max===3072 && k0.mitZoom.capabilities.resizeMode.length===2
    && k0.mitZoom.capabilities.frameRate.max===30 && k0.facing==='environment' && k0.rueck===true, k0 && JSON.stringify(k0.mitZoom.capabilities.zoom));
  chk('Teil A: Einstellung 4000×3000, Seitenverhaeltnis, zoom nach 0,5 geklemmt auf 1', k0 && k0.mitZoom.settings.width===4000 && k0.mitZoom.settings.height===3000
    && nah(k0.mitZoom.settings.aspectRatio, 4/3, 1e-9) && k0.mitZoom.zoom05.vorher===1 && k0.mitZoom.zoom05.ok===true && k0.mitZoom.zoom05.zoom===1, k0 && JSON.stringify(k0.mitZoom.zoom05));
  const eb=k0 && k0.mitZoom.erstesBild;
  chk('Teil A: erstes Bild per rVFC (Zeit ab Anfrage und ab Strom, captureTime vorhanden, Abstand zur Anzeige)', eb && eb.abStrom===120 && eb.ms===320 && eb.meta.hatCaptureTime
    && eb.meta.captureVorAnzeige===28 && eb.meta.width===4000 && eb.meta.felder.includes('presentationTime'), eb && JSON.stringify(eb));
  chk('Teil A: ImageCapture getPhotoCapabilities (Schnittstellen-Getter) und getPhotoSettings', k0 && k0.mitZoom.photoCapabilities.imageWidth.max===4080
    && k0.mitZoom.photoCapabilities.imageHeight.max===3072 && k0.mitZoom.photoCapabilities.fillLightMode.length===3 && k0.mitZoom.photoSettings.imageWidth===4080,
    k0 && JSON.stringify(k0.mitZoom.photoCapabilities));
  chk('Teil A: NotReadableError der Frontkamera in beiden Varianten protokolliert (einmal wiederholt), nicht hinten', k1 && !k1.mitZoom.ok && k1.mitZoom.fehler.name==='NotReadableError'
    && k1.mitZoom.wiederholt?.fehler.name==='NotReadableError' && k1.ohneZoom.fehler.name==='NotReadableError' && k1.rueck===false, k1 && JSON.stringify(k1.mitZoom.fehler));
  const lueck=r.stat.gum.slice(1).map(g=>Math.min(...r.H.stopps.filter(t=>t<=g.t).map(t=>g.t-t)));
  chk('Teil A: nach jedem stop() mindestens 0,8 s bis zur naechsten Kamera', r.H.stopps.length===4 && lueck.every(x=>x>=800), lueck.join(','));
  chk('Teil A: OverconstrainedError (constraint zoom) mit zoom:true, ohne zoom ok', k2 && k2.mitZoom.fehler.name==='OverconstrainedError' && k2.mitZoom.fehler.constraint==='zoom'
    && k2.ohneZoom.ok && k2.ohneZoom.capabilities.zoom===undefined && k2.ohneZoom.zoom05.zoom===null && k2.rueck===true, k2 && JSON.stringify(k2.mitZoom.fehler));
  chk('Teil A: rVFC ohne captureTime wird als fehlend gemeldet; haengendes getPhotoSettings endet in der Zeitgrenze',
    k2 && k2.ohneZoom.erstesBild.meta.hatCaptureTime===false && k2.ohneZoom.erstesBild.meta.captureTime===null && k2.ohneZoom.photoSettingsFehler.name==='Zeitgrenze'
    && k2.ohneZoom.photoCapabilities.imageWidth.max===4000);
  const rk=JSON.parse(r.ls.get('kamera-messung.rueck') || '[]');
  chk('Teil A: Rueckkameras fuer Teil B gemerkt (camera 0 und 2)', rk.length===2 && rk[0].id===KAM0.id && rk[1].id===KAM2.id, JSON.stringify(rk));
  chk('Teil A: Ergebnis zoomMin und zoom nach 0,5 je Kamera', JSON.stringify(L.ergebnis.zoomMin)==='[1,null,null]' && JSON.stringify(L.ergebnis.zoomNach05)==='[1,null,null]',
    JSON.stringify(L.ergebnis));
  chk('Teil A: Tabelle zeigt Kamera, Zoom 1–10 und Fehler', /camera 0, facing back/.test(r.text('erg')) && /1–10/.test(r.text('erg')) && /NotReadableError/.test(r.text('erg'))
    && /OverconstrainedError \(zoom\)/.test(r.text('erg')));
  chk('Teil A: sauber, danach ruhig (alle Spuren aus, keine Zeitgeber)', sauber(r) && await ruhig(r), sauberInfo(r));

  const r1=await seite({kameras:[{...KAM1, fehler:null, fehlerEinmal:{name:'NotReadableError', message:'Could not start video source'}}]});
  r1.klick('btnA'); await r1.bisFertig(); const [L1]=r1.laeufe('A'), k1b=L1.kameras[0];
  chk('Teil A: NotReadableError gleich nach stop() -> nach 1,5 s wiederholt, dann ok', k1b.mitZoom.ok && k1b.mitZoom.wiederholt?.fehler.name==='NotReadableError' && !k1b.mitZoom.fehler
    && k1b.mitZoom.ms>=1500 && k1b.ohneZoom.ok && !k1b.ohneZoom.wiederholt && sauber(r1) && await ruhig(r1), JSON.stringify(k1b.mitZoom.wiederholt));
  const r2=await seite({kameras:[KAM0], haengt:'gum'});
  r2.klick('btnA'); const z2=await r2.bisFertig(); const [L2]=r2.laeufe('A');
  chk('Teil A: getUserMedia antwortet nie -> Zeitgrenzen, Lauf endet', z2.fertig && L2.erst.fehler.name==='Zeitgrenze' && L2.kameras[0].mitZoom.fehler.name==='Zeitgrenze'
    && L2.kameras[0].ohneZoom.fehler.name==='Zeitgrenze' && z2.s<30 && sauber(r2) && await ruhig(r2), `${z2.s} s`);
  const r3=await seite({kameras:[KAM0], haengt:'applyConstraints', ohneImageCapture:true});
  r3.klick('btnA'); const z3=await r3.bisFertig(); const [L3]=r3.laeufe('A');
  chk('Teil A: applyConstraints antwortet nie -> Zeitgrenze, ohne ImageCapture -> „fehlt“', z3.fertig && L3.kameras[0].mitZoom.zoom05.fehler.name==='Zeitgrenze'
    && L3.kameras[0].mitZoom.imageCapture==='fehlt' && sauber(r3) && await ruhig(r3));

  // Befund 4: der Berechtigungsdialog darf nicht in die 8-s-Zeitgrenze laufen (Mensch liest 12 s)
  const r4=await seite({kameras:[KAM0], recht:'prompt', dialogMs:12000});
  const bVor=r4.els.get('btnB').disabled, kopfR=r4.KM.KOPF.kameraRecht;
  r4.klick('btnA'); const z4=await r4.bisFertig(); const [L4]=r4.laeufe('A');
  chk('Teil A: Dialog erst nach 12 s erlaubt -> lange Frist, kein Zeitgrenze-Fehler, danach granted und Teil B frei', z4.fertig && kopfR==='prompt' && bVor
    && L4.rechtVorher==='prompt' && !L4.erst.fehler && L4.erst.label===KAM0.label && L4.rechtNachher==='granted' && r4.KM.KOPF.kameraRecht==='granted'
    && !r4.els.get('btnB').disabled && L4.kameras[0].mitZoom.ok && L4.kameras[0].mitZoom.frist===60000 && L4.kameras[0].ohneZoom.frist===8000 && sauber(r4) && await ruhig(r4),
    JSON.stringify(L4.erst.fehler || L4.kameras[0].mitZoom.fehler || null));
  const r5=await seite({kameras:[KAM0, KAM2], rechtPtz:'prompt', dialogMs:12000});
  r5.klick('btnA'); await r5.bisFertig(); const [L5]=r5.laeufe('A'), m5=L5.kameras.map(k=>k.mitZoom);
  chk('Teil A: Schwenken/Zoomen-Dialog nach 12 s -> erste zoom-Anfrage mit 60 s ok, die naechste wieder 8 s', L5.rechtZoom==='prompt' && m5[0].ok && m5[0].frist===60000
    && m5[0].ms>=12000 && m5[1].frist===8000 && sauber(r5) && await ruhig(r5), m5.map(m=>m.frist+'/'+m.ms).join(', '));
  const r6=await seite({rueck:RUECK0});
  r6.ctx.navigator.mediaDevices.enumerateDevices=()=>Promise.resolve([{kind:'videoinput', deviceId:'', groupId:'', label:''}]);
  r6.klick('btnA'); await r6.bisFertig(); const [L6]=r6.laeufe('A');
  chk('Teil A: enumerateDevices ohne deviceId -> gemerkte Rueckkameras bleiben (nicht mit [] ueberschrieben)', r6.ls.get('kamera-messung.rueck')===RUECK0
    && L6.ereignisse.some(e=>e.typ==='rueck-unveraendert') && sauber(r6), r6.ls.get('kamera-messung.rueck'));
  const r7=await seite({recht:'denied'});
  r7.klick('btnA'); await r7.bisFertig(); const [L7]=r7.laeufe('A');
  chk('Teil A: Berechtigung verweigert -> NotAllowedError protokolliert, Teil B bleibt gesperrt', L7.erst.fehler.name==='NotAllowedError' && r7.KM.KOPF.kameraRecht==='denied'
    && r7.els.get('btnB').disabled && sauber(r7) && await ruhig(r7));
}

// ------------------------------------------------------------------ 4. Teil B
const B_FAELLE=[
  ['eingefroren', 'gum-verdraengt-ar', 'eingefroren'], ['ohnePose', 'gum-verdraengt-ar', 'ohne-pose'], ['aus', 'gum-verdraengt-ar', 'aus'],
  ['schwarz', 'gum-verdraengt-ar', 'schwarz'], ['notreadable', 'gum-scheitert-ar-laeuft', 'laeuft'], ['beide', 'beide-laufen', 'laeuft'],
  ['haengt', 'gum-haengt-ar-laeuft', 'laeuft'], ['spaet', 'gum-haengt-ar-laeuft', 'laeuft'], ['emul', 'gum-verdraengt-ar', 'emuliert'], ['langsam', 'gum-stoert-ar', 'langsam']];
const BR={};
for(const [reaktion, klasse, ar] of B_FAELLE){
  const r=await seite({reaktion, rueck:RUECK0});
  r.klick('btnB');
  let mitte=null;
  if(reaktion==='beide'){ await r.lauf(r.uhr()+12000); r.verdecken('hidden'); await r.lauf(r.uhr()+500); r.verdecken('visible'); const v=r.els.get('vid');
    mitte={vidOrt:v.parentNode && v.parentNode.id, arZu:r.els.get('ar').cl.has('hidden'), arVidZu:r.els.get('arVid').cl.has('hidden'), status:r.text('arStatus')}; }
  const z=await r.bisFertig();
  const [L]=r.laeufe('B'), vs=L ? L.versuche || [] : [];
  BR[reaktion]={r, L, vs, z, mitte, ruhig:await ruhig(r)};
  chk(`Teil B ${reaktion}: zwei Versuche (facingMode, deviceId camera 0) -> ${klasse}, AR ${ar}`, z.fertig && vs.length===2
    && vs.every(v=>v.einordnung.klasse===klasse && v.einordnung.ar===ar) && vs[0].art==='facingMode' && vs[1].art==='deviceId' && vs[1].anfrage.video.deviceId.exact===KAM0.id,
    vs.map(v=>`${v.einordnung.klasse}/${v.einordnung.ar}, ${v.waehrend.fps} B/s, Pose fehlt ${v.waehrend.ohnePose}, steht ${v.waehrend.laufMax}, gUM ${v.waehrend.gum}`).join(' | '));
  chk(`Teil B ${reaktion}: vorher laeuft AR, nach dem Schliessen erholt`, vs.length && vs.every(v=>v.vorher.zustand==='laeuft' && v.einordnung.erholt===true && v.danach.zustand==='laeuft'
    && v.danachEnde.zustand==='laeuft' && v.arStabil===true),
    vs.map(v=>`${v.vorher.zustand} -> ${v.danach && v.danach.zustand}`).join(' | '));
  chk(`Teil B ${reaktion}: sauber, danach ruhig`, sauber(r) && BR[reaktion].ruhig, sauberInfo(r));
}
{
  const {r, L, vs, mitte}=BR.beide;
  const a=r.stat.anfragen[0];
  chk('Teil B: requestSession in der Nutzergeste, Features wie raumskizze-probe, dom-overlay auf #ar', a && a.geste && r.stat.ohneGeste===0
    && JSON.stringify(a.optionalFeatures)===JSON.stringify(['local', 'hit-test', 'anchors', 'dom-overlay', 'camera-access', 'plane-detection', 'depth-sensing'])
    && a.root==='ar' && a.depthSensing.usagePreference[0]==='cpu-optimized' && a.depthSensing.dataFormatPreference.join()==='luminance-alpha,unsigned-short');
  chk('Teil B: Sitzung protokolliert (Features, camera-access, Binding, Hit-Test)', L.sitzungOk && L.sitzung.features.includes('camera-access') && L.sitzung.kamerazugriff
    && L.sitzung.binding && L.sitzung.hitTest && L.sitzung.domOverlay==='screen');
  const tS=L.ereignisse.find(e=>e.typ==='sitzung-start');
  chk('Teil B: erster Versuch erst nach 8 s ruhiger Sitzung', tS && vs[0].t-tS.t>=8 && vs[0].t-tS.t<9.5, tS && (vs[0].t-tS.t).toFixed(2));
  const k=L.xr.filter(x=>x.xr && x.n);
  chk('Teil B: Takte je Sekunde mit Kamera 861×1920, Sichtfeld 34,6° × 69,6°, Viewport, ~30 B/s', k.length>40 && k.every(x=>x.cam.join('x')==='861x1920' && nah(x.fov.h, 34.6, 0.01)
    && nah(x.fov.v, 69.6, 0.01) && x.vp.join('x')==='1080x2400') && nah(vs[0].vorher.fps, 30, 1.5), `${k.length} Takte, vorher ${vs[0].vorher.fps} B/s`);
  chk('Teil B: Kachel 16×16 aus der Bildmitte der Kameratextur, Textur je Bild wieder abgehaengt', JSON.stringify(r.stat.kachel)===JSON.stringify([422, 952, 16, 16])
    && r.stat.texLiegt===0 && !r.stat.leerGelesen, JSON.stringify(r.stat.kachel));
  chk('Teil B beide: getUserMedia liefert Bilder (rVFC) neben AR, erstes Bild, Spur live', vs.every(v=>v.waehrend.gum>=250 && v.gum.erstesBild && v.gum.readyState==='live' && v.ergebnis==='ok'),
    vs.map(v=>v.waehrend.gum).join(','));
  chk('Teil B: visibilitychange je Versuch protokolliert', vs[0].sichtbarkeit.map(e=>e.zustand).join()==='hidden,visible' && vs[1].sichtbarkeit.length===0,
    JSON.stringify(vs.map(v=>v.sichtbarkeit)));
  chk('Teil B: Video waehrend der Sitzung im Overlay (#arVid sichtbar), Statuszeile mit Sichtfeld', mitte && mitte.vidOrt==='arVid' && !mitte.arZu && !mitte.arVidZu
    && /Sichtfeld 34\.6° × 69\.6°/.test(mitte.status) && /gUM \d+ B\/s/.test(mitte.status), mitte && JSON.stringify(mitte));
  const e=BR.eingefroren.vs[0].waehrend, p=BR.ohnePose.vs[0].waehrend, au=BR.aus.vs[0].waehrend, sw=BR.schwarz.vs[0].waehrend;
  chk('Teil B: eingefroren = 15 Hz mit stehender Kachel, ohne Pose = keine Posen, aus = keine XR-Bilder', nah(e.fps, 15, 1.5) && e.laufMax>=100 && p.ohnePose>=0.9*p.n
    && au.fps<1 && e.gum>=250, `${e.fps} B/s steht ${e.laufMax} | Pose fehlt ${p.ohnePose}/${p.n} | ${au.fps} B/s`);
  chk('Teil B: schwarzes Bild zaehlt nicht als eingefroren', sw.schwarz>=0.9*sw.n && sw.laufMax===0 && sw.zt.steht===0 && sw.zt.schwarz>=9, `schwarz ${sw.schwarz}/${sw.n}, steht ${sw.laufMax}`);
  const zsum=k=>Object.values(k.zt).reduce((a, b)=>a+b, 0), ztF=L.xr.filter(k=>k.xr && k.d>=0.05 && !nah(zsum(k), k.d, 0.012));
  chk('Teil B: Zeit je Zustand summiert sich je XR-Takt auf seine Dauer (nichts doppelt, nichts verloren)', !ztF.length, ztF.slice(0, 3).map(k=>`${k.t}: ${zsum(k).toFixed(3)}/${k.d}`).join(', '));
  const em=BR.emul.vs[0].waehrend, la=BR.langsam.vs[0].waehrend;
  chk('Teil B: emulatedPosition je Bild gezaehlt und als Zeit gefuehrt; 15 Hz mit lebendem Bild = langsam, nicht eingefroren', em.emul>=250 && em.zt.emul>=9.5
    && nah(la.fps, 15, 1.5) && la.zt.steht===0 && la.laufMax===0, `emul ${em.emul}/${em.zt.emul} s, langsam ${la.fps} B/s`);
  chk('Teil B: Kameraberechtigung je Versuch, Kosten der Kachel je Takt, gUM-Zaehler unabhaengig vom Zeichnen (stats, Qualitaet)', vs.every(v=>v.recht==='granted')
    && L.xr.filter(k=>k.xr && k.n).every(k=>k.leseMed!=null && k.leseMax>=k.leseMed) && vs.every(v=>v.gumHalb.gumS>=120 && v.gumHalb.gumQ>=120 && v.gumHalb.gumRate>=25),
    vs.map(v=>`${v.recht}, stats ${v.gumHalb.gumS}, q ${v.gumHalb.gumQ}`).join(' | '));
  const nr=BR.notreadable.vs, hg=BR.haengt.vs, sp=BR.spaet;
  chk('Teil B: NotReadableError protokolliert (Name, Dauer), AR laeuft weiter', nr.every(v=>v.ergebnis==='fehler' && v.fehler.name==='NotReadableError' && v.ms===400 && v.waehrend.zustand==='laeuft'));
  chk('Teil B: getUserMedia haengt -> Zeitgrenze nach 8 s, Teil endet', hg.every(v=>v.ergebnis==='zeit' && v.fehler.name==='Zeitgrenze' && v.ms===8000) && BR.haengt.z.fertig);
  chk('Teil B: zu spaet gelieferter Strom wird gestoppt und protokolliert', sp.vs.every(v=>v.ergebnis==='zeit') && sp.L.ereignisse.filter(x=>x.typ==='gum-spaet').length===2
    && sp.r.H.spuren.length===2 && sp.r.H.spuren.every(t=>t.readyState==='ended'));
}
{
  const r=await seite({reaktion:'endet', rueck:RUECK0});
  r.klick('btnB'); const z=await r.bisFertig(); const [L]=r.laeufe('B');
  chk('Teil B: Sitzung endet durch getUserMedia -> ar-endet, kein weiterer Versuch an toter Sitzung', z.fertig && L.versuche.length===1 && L.versuche[0].einordnung.klasse==='ar-endet'
    && L.versuche[0].sitzungEnde!=null && L.ergebnis.sitzungEndeVonSelbst && L.ereignisse.some(e=>e.typ==='versuche-abgebrochen') && r.stat.gum.length===1
    && sauber(r) && await ruhig(r), L && L.versuche.map(v=>v.einordnung.klasse).join());
  const r2=await seite({reaktion:'beide'});
  r2.klick('btnB'); await r2.lauf(r2.uhr()+2000); const gk=r2.klick('btnGum'); const z2=await r2.bisFertig(); const [L2]=r2.laeufe('B');
  const tS=L2.ereignisse.find(e=>e.typ==='sitzung-start');
  chk('Teil B: Knopf „getUserMedia jetzt“ startet sofort; ohne Teil A nur facingMode', gk && z2.fertig && L2.versuche.length===1 && L2.versuche[0].t-tS.t<2.5
    && L2.ereignisse.some(e=>e.typ==='versuche-start' && e.knopf) && L2.ereignisse.some(e=>e.typ==='ohne-teil-a') && sauber(r2) && await ruhig(r2));
  const r3=await seite({reaktion:'beide', rueck:RUECK0});
  r3.klick('btnB'); await r3.lauf(r3.uhr()+3000); const ek=r3.klick('btnArEnde'); const z3=await r3.bisFertig(); const [L3]=r3.laeufe('B');
  chk('Teil B: Ende-Knopf im Overlay beendet Sitzung und Teil sofort', ek && z3.fertig && z3.s<3 && L3.abgebrochen==='Knopf' && L3.versuche.length===0 && sauber(r3) && await ruhig(r3), `${z3.s} s`);
  for(const h of ['requestSession', 'requestReferenceSpace', 'makeXRCompatible']){
    const rh=await seite({haengt:h, rueck:RUECK0});
    rh.klick('btnB'); const zh=await rh.bisFertig(); const [Lh]=rh.laeufe('B');
    const grund=h==='requestSession' ? Lh.sitzungFehler && Lh.sitzungFehler.name : Lh.fehler[0] && Lh.fehler[0].name;
    chk(`Teil B: ${h} antwortet nie -> Zeitgrenze protokolliert, Teil endet`, zh.fertig && grund==='Zeitgrenze' && zh.s<40 && sauber(rh) && await ruhig(rh), `${zh.s} s, ${grund}`);
  }
  const rl=await seite({arSpaetMs:35000, rueck:RUECK0});
  rl.klick('btnB'); const zl=await rl.bisFertig(); await rl.lauf(rl.uhr()+10000); const [Ll]=rl.laeufe('B');
  chk('Teil B: zu spaet gelieferte Sitzung wird beendet', zl.fertig && Ll.sitzungFehler.name==='Zeitgrenze' && Ll.ereignisse.some(e=>e.typ==='sitzung-spaet-beendet') && !rl.H.sitzung && sauber(rl));
}

// ------------------------------------------------------------------ 4b. Teil B: Teilstoerungen (Gegenpruefung S1-S9)
// Die alte Einordnung meldete hier falsch „beide-laufen“ (S2, S2b, S4, S8) bzw. „verdraengt“ (S1, S3); Zeiten relativ zum Sitzungsbeginn.
const SZ=[
  ['S1 0,6 s Standbild im Fenster -> beide-laufen, kurzer Haenger nur als Zahl', {xrZustand:t=>t>=9.0 && t<9.6 ? {eingefroren:true} : {}},
    v=>v.einordnung.klasse==='beide-laufen' && v.waehrend.kurzerHaenger===true && v.waehrend.laufMax>=15 && v.waehrend.zt.steht<0.7],
  ['S2 4 s ohne XR-Bilder -> gum-stoert-ar (unterbrochen)', {xrZustand:t=>t>=9.0 && t<13.0 ? {aus:true} : {}},
    v=>v.einordnung.klasse==='gum-stoert-ar' && v.waehrend.zustand==='unterbrochen' && nah(v.waehrend.zt.aus, 4, 0.3)],
  ['S2b 4,9 s ohne Pose -> gum-stoert-ar (unterbrochen)', {xrZustand:t=>t>=9.0 && t<13.9 ? {ohnePose:true} : {}},
    v=>v.einordnung.klasse==='gum-stoert-ar' && v.waehrend.zustand==='unterbrochen' && nah(v.waehrend.zt.ohnePose, 4.9, 0.2)],
  ['S4 Standbild, solange getUserMedia 5,7 s aussteht -> gum-stoert-ar (Fenster ab Aufruf)', {wartenStoerung:'standbild', gumMs:5700},
    v=>v.einordnung.klasse==='gum-stoert-ar' && v.warten.zustand==='eingefroren' && v.nachAntwort.zustand==='laeuft' && v.ta-v.t>=5.6],
  ['S8 getUserMedia liefert nur 1 s von 10 -> gum-ohne-bild-ar-laeuft (gelb)', {gumKurzMs:1000},
    v=>v.einordnung.klasse==='gum-ohne-bild-ar-laeuft' && v.einordnung.gumLiefert===false && v.waehrend.gum>=25 && v.gumHalb.gumRate===0],
  ['S9 rVFC feuert im Overlay nie, Spur liefert -> beide-laufen ueber track.stats', {rvfcStumm:true},
    v=>v.einordnung.klasse==='beide-laufen' && v.gumHalb.gum===0 && v.gumHalb.gumQuelle==='stats' && v.gumHalb.gumRate>=25],
  ['S9b rVFC stumm, ohne track.stats, Qualitaet zaehlt nur Gezeichnetes -> kein-urteil (gelb), nicht gum-ohne-bild', {rvfcStumm:true, ohneStats:true, qualitaetGezeichnet:true},
    v=>v.einordnung.klasse==='kein-urteil' && v.einordnung.gumLiefert===null && v.waehrend.zustand==='laeuft' && v.gumHalb.gumQ===0],
  ['S9c rVFC stumm, ohne track.stats, Qualitaet zaehlt die Quelle -> beide-laufen ueber Qualitaet', {rvfcStumm:true, ohneStats:true},
    v=>v.einordnung.klasse==='beide-laufen' && v.gumHalb.gumQuelle==='qualitaet' && v.gumHalb.gumRate>=25],
  ['S9d rVFC stumm, ohne stats und Qualitaet -> kein-urteil', {rvfcStumm:true, ohneStats:true, ohneQualitaet:true},
    v=>v.einordnung.klasse==='kein-urteil' && v.einordnung.gumLiefert===null],
  ['60 Hz zeichnen bei 30-Hz-Kamera (einzelne Doppel) -> nicht eingefroren, beide-laufen', {xrZustand:()=>({fps:60, doppelt:true})},
    v=>v.einordnung.klasse==='beide-laufen' && v.waehrend.zt.steht===0 && v.waehrend.gleich>=250 && v.waehrend.laufMax===1],
  ['AR braucht nach dem Stoppen 1,5 s (Ruckler) -> erholt aus den letzten 4 s', {reaktion:'aus', erholMs:1500},
    v=>v.einordnung.klasse==='gum-verdraengt-ar' && v.einordnung.erholt===true && v.danach.zustand==='unterbrochen' && v.danachEnde.zustand==='laeuft'],
  ['helle Kachel (Lampe) 7 s -> kein Stillstand, kein-urteil', {xrZustand:t=>t>=9 && t<16 ? {hell:true} : {}},
    v=>v.einordnung.klasse==='kein-urteil' && v.waehrend.zustand==='hell' && v.waehrend.zt.steht===0 && v.waehrend.hell>=150]];
for(const [name, o2, ok2] of SZ){
  const r=await seite({reaktion:'beide', ...o2});
  r.klick('btnB'); const z=await r.bisFertig(); const [L]=r.laeufe('B'), v=L && L.versuche && L.versuche[0];
  let gut=false; try{ gut=!!(z.fertig && v && ok2(v)); }catch(e){}
  chk('Teil B '+name, gut && sauber(r) && await ruhig(r), v && `${v.einordnung.klasse}, ${v.waehrend.zustand}, gestoert ${v.waehrend.stoer} s, gUM ${v.gumHalb && v.gumHalb.gumRate} B/s`);
}
{
  const r=await seite({reaktion:'beide', xrZustand:()=>({ohnePose:true})});
  r.klick('btnB'); const z=await r.bisFertig(); const [L]=r.laeufe('B'), v=L.versuche[0], tS=L.ereignisse.find(e=>e.typ==='sitzung-start');
  chk('Teil B S3: ARCore trackt nie -> 20 s auf ruhige Ortung gewartet, dann ar-lief-vorher-nicht (ohne Bedingung waere es gum-verdraengt-ar)', z.fertig
    && v.einordnung.klasse==='ar-lief-vorher-nicht' && v.einordnung.ohneVorher==='gum-verdraengt-ar' && v.arStabil===false && v.t-tS.t>=28
    && L.ereignisse.some(e=>e.typ==='ar-nicht-stabil') && sauber(r) && await ruhig(r), `${v.einordnung.klasse}/${v.einordnung.ohneVorher}, ${(v.t-tS.t).toFixed(1)} s`);
  const r2=await seite({reaktion:'eingefroren', bleibt:true, rueck:RUECK0});
  r2.klick('btnB'); const z2=await r2.bisFertig(); const [L2]=r2.laeufe('B'), [v0, v1]=L2.versuche;
  chk('Teil B S5: AR erholt sich nach dem Schliessen nicht -> erholt=false, der zweite Versuch nach 20 s Warten ar-lief-vorher-nicht', z2.fertig && v0.einordnung.klasse==='gum-verdraengt-ar'
    && v0.einordnung.erholt===false && v0.danachEnde.zustand==='eingefroren' && v1 && v1.einordnung.klasse==='ar-lief-vorher-nicht' && v1.arStabil===false
    && /ar-lief-vorher-nicht \(gum-verdraengt-ar\)/.test(r2.text('erg')) && sauber(r2) && await ruhig(r2), L2.versuche.map(v=>v.einordnung.klasse+'/'+v.einordnung.erholt).join(', '));
  const rp=await seite({recht:'prompt'});
  chk('Teil B: ohne Kameraberechtigung gesperrt (Dialog kaeme sonst mitten in AR), Hinweis „erst Teil A“', rp.els.get('btnB').disabled && !rp.klick('btnB')
    && rp.stat.anfragen.length===0 && /erst Teil A/.test(rp.text('rechtB')) && /prompt/.test(rp.text('kopf')) && sauber(rp), rp.text('rechtB'));
  const ru=await seite({ohnePermissions:true});
  chk('Teil B: ohne Permissions-API „unbekannt“ -> frei, im Kopf vermerkt', ru.KM.KOPF.kameraRecht==='unbekannt' && !ru.els.get('btnB').disabled && /unbekannt/.test(ru.text('kopf')) && sauber(ru));
}

// ------------------------------------------------------------------ 5. Teil C
{
  const r=await seite({cReaktion:'stumm'});
  chk('Teil C: Kamera starten', r.klick('btnC'));
  await r.lauf(r.uhr()+2500);
  const frueh=r.klick('btnC2'), vOrt=r.els.get('vid').parentNode.id, vSicht=!r.els.get('vidC').cl.has('hidden');
  await r.lauf(r.uhr()+1500);
  const spaet=r.klick('btnC2');
  await r.lauf(r.uhr()+3000);
  const mitte={ort:r.els.get('vid').parentNode.id, ar:!r.els.get('ar').cl.has('hidden')};
  const z=await r.bisFertig(); const [L]=r.laeufe('C');
  chk('Teil C: Video sichtbar in Karte C, „AR jetzt starten“ erst nach 3 s, als eigener Tipp', !frueh && spaet && vOrt==='vidC' && vSicht && r.stat.anfragen.length===1
    && r.stat.anfragen[0].geste && L.kameraVorAR>=3 && L.vorAR.gum>=60, `vorher ${L.vorAR && L.vorAR.gum} Bilder, ${L.kameraVorAR} s`);
  chk('Teil C stumm: AR laeuft, getUserMedia stumm -> ar-verdraengt-gum, kommt nach dem Ende zurueck', z.fertig && L.sitzungOk && L.waehrend.zustand==='laeuft' && L.waehrend.gum===0
    && L.danach.gum>=150 && L.einordnung.klasse==='ar-verdraengt-gum' && L.einordnung.gumZurueck===true, `${L.einordnung.klasse}, danach ${L.danach.gum} Bilder`);
  chk('Teil C: mute/unmute protokolliert, Spurzustand je Phase', L.spur.map(e=>e.typ).join()==='mute,unmute' && L.spurWaehrend.muted===true && L.spurDanach.muted===false
    && L.spurDanach.readyState==='live', JSON.stringify(L.spur));
  chk('Teil C: Video waehrend AR im Overlay', mitte.ort==='arVid' && mitte.ar, JSON.stringify(mitte));
  chk('Teil C: sauber, danach ruhig', sauber(r) && await ruhig(r), sauberInfo(r));

  // Ablehnung nach 20 ms, vor dem naechsten 200-ms-Blick der Seite: ohne p.catch in arAnfragen waere sie unbehandelt.
  const r2=await seite({arFehler:'NotSupportedError', arFehlerMs:20});
  r2.klick('btnC'); await r2.lauf(r2.uhr()+3250); r2.klick('btnC2'); const z2=await r2.bisFertig(); const [L2]=r2.laeufe('C');
  chk('Teil C: requestSession abgelehnt -> ar-scheitert, Kamerabild laeuft weiter', z2.fertig && L2.sitzungOk===false && L2.sitzungFehler.name==='NotSupportedError'
    && L2.einordnung.klasse==='ar-scheitert' && L2.einordnung.gumZurueck===true && sauber(r2) && await ruhig(r2));
  const r3=await seite({});
  r3.klick('btnC'); const z3=await r3.bisFertig(); const [L3]=r3.laeufe('C');
  chk('Teil C: ohne zweiten Tipp endet der Teil nach 30 s Wartezeit', z3.fertig && L3.sitzungFehler.name==='KeinTipp' && L3.ereignisse.some(e=>e.typ==='kein-ar-start')
    && z3.s<45 && r3.stat.anfragen.length===0 && sauber(r3) && await ruhig(r3), `${z3.s} s`);
  const r4=await seite({cReaktion:'endet'});
  r4.klick('btnC'); await r4.lauf(r4.uhr()+3500); r4.klick('btnC2'); const z4=await r4.bisFertig(); const [L4]=r4.laeufe('C');
  chk('Teil C: getUserMedia endet durch AR -> ended protokolliert, kommt nicht zurueck', z4.fertig && L4.spur.some(e=>e.typ==='ended') && L4.einordnung.klasse==='ar-verdraengt-gum'
    && L4.einordnung.gumZurueck===false && L4.spurDanach.readyState==='ended' && sauber(r4) && await ruhig(r4));
  const r5=await seite({reaktion:'beide', cReaktion:'keine'});
  r5.klick('btnC'); await r5.lauf(r5.uhr()+3500); r5.klick('btnC2'); const z5=await r5.bisFertig(); const [L5]=r5.laeufe('C');
  chk('Teil C: beide laufen (Anlauf bis zur ruhigen Ortung eigens, gUM-Rate aus der zweiten Haelfte)', z5.fertig && L5.einordnung.klasse==='beide-laufen' && L5.waehrend.gum>=250
    && L5.arStabil===true && L5.arAnlauf && L5.waehrendHalb.gumRate>=25 && L5.einordnung.gumZurueck===true && sauber(r5));
  const r6=await seite({reaktion:'beide', cReaktion:'keine', rvfcStumm:true});
  r6.klick('btnC'); await r6.lauf(r6.uhr()+3500); r6.klick('btnC2'); const z6=await r6.bisFertig(); const [L6]=r6.laeufe('C');
  chk('Teil C: rVFC feuert nie -> Einordnung ueber track.stats (beide laufen), nicht „AR verdraengt gUM“', z6.fertig && L6.einordnung.klasse==='beide-laufen'
    && L6.waehrend.gum===0 && L6.waehrendHalb.gumQuelle==='stats' && sauber(r6) && await ruhig(r6), L6.einordnung.klasse);
  const r8=await seite({cReaktion:'keine', vorKurzMs:500});
  r8.klick('btnC'); await r8.lauf(r8.uhr()+3500); r8.klick('btnC2'); const z8=await r8.bisFertig(); const [L8]=r8.laeufe('C');
  chk('Teil C: Kamera lieferte vor AR nicht (0,5 s von 3 s) -> gum-lief-vorher-nicht, AR bekommt keine Schuld', z8.fertig && L8.einordnung.klasse==='gum-lief-vorher-nicht'
    && L8.vorAR.gumRate<10 && sauber(r8) && await ruhig(r8), `${L8.einordnung.klasse}, vorher ${L8.vorAR.gumRate} B/s`);
  const r7=await seite({cReaktion:'keine', xrZustand:t=>t<4 ? {ohnePose:true} : {}});
  r7.klick('btnC'); await r7.lauf(r7.uhr()+3500); r7.klick('btnC2'); const z7=await r7.bisFertig(); const [L7]=r7.laeufe('C');
  chk('Teil C: 4 s Anlauf ohne Pose zaehlt nicht als Stoerung (erst ruhige Ortung, dann 10 s werten)', z7.fertig && L7.einordnung.klasse==='beide-laufen' && L7.arStabil===true
    && L7.arAnlauf.zt.ohnePose>=3.5 && L7.waehrend.zustand==='laeuft' && /ruhig \(ohne Pose [34]\.\d+ s\)/.test(r7.text('erg')) && sauber(r7) && await ruhig(r7), `${L7.einordnung.klasse}, Anlauf ohne Pose ${L7.arAnlauf.zt.ohnePose} s`);
}

// ------------------------------------------------------------------ 6. Teil D
{
  const r=await seite({ausrichtung:'landscape-primary'});
  r.klick('btnDq'); await r.lauf(r.uhr()+12000);
  const hinweis=r.text('status'), hinweisAR=r.text('arHint');
  r.drehen('portrait-primary');
  const z=await r.bisFertig(); const [L]=r.laeufe('D'), a=L.ergebnis;
  chk('Teil D quer: Start quer, Kamera 1920×861, Sichtfeld 69,6° × 34,6°, Viewport 2400×1080', z.fertig && L.variante==='quer' && L.startAusrichtung==='landscape-primary'
    && a.start.typ==='landscape-primary' && a.start.cam.join('x')==='1920x861' && nah(a.start.fov[0], 69.6, 0.01) && nah(a.start.fov[1], 34.6, 0.01) && a.start.vp.join('x')==='2400x1080',
    a && JSON.stringify(a.start));
  chk('Teil D quer: Drehung ins Hochformat erkannt, Kamera und Sichtfeld blieben (Sitzung gesperrt)', a.drehung && a.physischGedreht && a.rollMax===90 && a.typen.join()==='landscape-primary,portrait-primary'
    && !a.kameraWechsel && !a.sichtfeldWechsel && !a.viewportWechsel && a.ende.typ==='portrait-primary' && a.ende.inner.join('x')==='412x915', JSON.stringify(a.typen));
  chk('Teil D: Hinweis nach 10 s (Seite und Overlay), Proben alle 2 s, Ende nach 25 s', /Hochformat drehen/.test(hinweis) && /Hochformat drehen/.test(hinweisAR)
    && L.proben.length>=13 && L.proben.length<=14 && L.proben.slice(1).every((p, i)=>p.t-L.proben[i].t<=2.01) && L.dauer>=25 && L.dauer<28
    && L.ereignisse.some(e=>e.typ==='hinweis-drehen'), `${L.proben.length} Proben, ${L.dauer} s`);
  chk('Teil D: Ereignisse Ausrichtung und Groesse beim Drehen', L.ereignisse.some(e=>e.typ==='ausrichtung' && e.ausrichtung==='portrait-primary' && e.inner && e.inner.join('x')==='412x915')
    && L.ereignisse.some(e=>e.typ==='groesse'));
  chk('Teil D: Tabelle zeigt Start, Kamera und Sichtfeld', /landscape-primary/.test(r.text('erg')) && /1920×861 · 69\.6° × 34\.6°/.test(r.text('erg'))
    && /ja \(90°\), Schwere 90° · ja: landscape-primary → portrait-primary/.test(r.text('erg')) && /nichts/.test(r.text('erg')), r.text('erg').slice(-160));
  chk('Teil D quer: Schwerkraft je Probe (Start quer = 90°), Drehung auch so erkannt', L.proben.every(p=>p.g && p.g.length===3) && L.proben[0].rollG===90 && a.rollGMax===90
    && a.gedrehtSchwere===true, JSON.stringify(L.proben[0].g));
  chk('Teil D quer: sauber, danach ruhig', sauber(r) && await ruhig(r), sauberInfo(r));
  const r2=await seite({});
  r2.klick('btnDh'); await r2.lauf(r2.uhr()+12000); const h2=r2.text('status'); r2.drehen('landscape-primary');
  const z2=await r2.bisFertig(); const [L2]=r2.laeufe('D'), b=L2.ergebnis;
  chk('Teil D hochkant zum Vergleich: 861×1920, 34,6° × 69,6°, Drehung erkannt, Hinweis quer', z2.fertig && L2.variante==='hoch' && b.start.cam.join('x')==='861x1920'
    && nah(b.start.fov[0], 34.6, 0.01) && b.drehung && /Querformat drehen/.test(h2) && sauber(r2) && await ruhig(r2), JSON.stringify(b.start));
  const r3=await seite({});
  r3.klick('btnDq'); const z3=await r3.bisFertig(); const [L3]=r3.laeufe('D');
  chk('Teil D: „quer“ gedrueckt, aber hochkant gehalten -> so protokolliert, ohne Drehung', z3.fertig && L3.startAusrichtung==='portrait-primary' && L3.ergebnis.drehung===false
    && L3.ergebnis.physischGedreht===false && L3.ergebnis.gedrehtSchwere===false && /nein \(0°\), Schwere 0° · nein/.test(r3.text('erg')), r3.text('erg').slice(-60));
  // Chrome sperrt die Ausrichtung: Telefon wird gedreht, screen.orientation und Fenster bleiben, Kamera bleibt
  const r4=await seite({ausrichtung:'landscape-primary'});
  r4.klick('btnDq'); await r4.lauf(r4.uhr()+12000); r4.rollen(-90);
  const z4=await r4.bisFertig(); const [L4]=r4.laeufe('D'), g=L4.ergebnis;
  chk('Teil D gesperrt: Telefon gedreht (Rollwinkel), Bildschirm folgte nicht, Kamera blieb', z4.fertig && g.physischGedreht===true && g.rollMax===90 && g.drehung===false
    && !g.kameraWechsel && !L4.ereignisse.some(e=>e.typ==='ausrichtung') && g.gedrehtSchwere===true && /ja \(90°\), Schwere 90° · nein/.test(r4.text('erg'))
    && sauber(r4) && await ruhig(r4), JSON.stringify({p:g.physischGedreht, d:g.drehung, r:g.rollMax}));
  // Dreht Chrome die Ansicht mit dem Bildschirm, bleibt der Pose-Rollwinkel bei 0 - die Schwerkraft sieht die Drehung trotzdem
  const r5=await seite({ausrichtung:'landscape-primary', poseOhneRoll:true});
  r5.klick('btnDq'); await r5.lauf(r5.uhr()+12000); r5.drehen('portrait-primary');
  const z5=await r5.bisFertig(); const [L5]=r5.laeufe('D'), h=L5.ergebnis;
  chk('Teil D: Pose ohne Rollwinkel -> „Telefon gedreht“ nein, Schwerkraft ja (90°)', z5.fertig && h.physischGedreht===false && h.gedrehtSchwere===true && h.rollGMax===90
    && /nein \(0°\), Schwere 90° · ja/.test(r5.text('erg')) && sauber(r5) && await ruhig(r5), JSON.stringify({p:h.physischGedreht, s:h.gedrehtSchwere, g:h.rollGMax}));
  const r6=await seite({ohneBewegung:true});
  r6.klick('btnDh'); await r6.bisFertig(); const [L6]=r6.laeufe('D');
  chk('Teil D: ohne devicemotion -> Schwerkraft fehlt (null), sonst wie gehabt', L6.proben.every(p=>p.g===null && p.rollG===null) && L6.ergebnis.gedrehtSchwere===null && sauber(r6));
}

// ------------------------------------------------------------------ 7. Protokoll: alle Teile, JSON, Neuladen, Sichern, Teilen
{
  const ls=new Map();
  const r=await seite({ls, kameras:[KAM0, KAM1], reaktion:'beide', cReaktion:'stumm'});
  r.klick('btnA'); await r.bisFertig();
  r.klick('btnB'); await r.bisFertig();
  r.klick('btnC'); await r.lauf(r.uhr()+3500); r.klick('btnC2'); await r.bisFertig();
  r.klick('btnDh'); await r.bisFertig();
  const roh=ls.get('kamera-messung.protokoll'), P=JSON.parse(roh);
  chk('Protokoll: alle Teile A, B, C, D fertig in localStorage', P.werkzeug==='kamera-messung' && P.version===2 && P.laeufe.map(L=>L.teil).join('')==='ABCD' && P.laeufe.every(L=>L.fertig),
    P.laeufe.map(L=>L.teil+(L.fertig ? '' : '?')).join(''));
  chk('Protokoll: Teil B nimmt die Rueckkamera aus Teil A', P.laeufe[1].versuche.length===2 && P.laeufe[1].versuche[1].anfrage.video.deviceId.exact===KAM0.id);
  chk('Protokoll: Kopf (Version, Zeit, URL, Geraet, Erwartung) und Kopf je Lauf', P.erstellt==='2026-10-26T12:00:00.000Z' && P.url==='https://geraet.test/kamera-messung.html'
    && P.geraet.modell==='Pixel 9 Pro' && P.geraet.browser==='Google Chrome 155.0.8059.87' && Object.keys(P.erwartung).join('')==='ABCD' && P.laeufe.every(L=>L.kopf && L.kopf.ausrichtung)
    && P.aufrufe.length===1);
  const rund=JSON.parse(JSON.stringify(r.KM.P));
  chk('Protokoll: JSON-serialisierbar ohne Verlust, gleich dem gespeicherten', JSON.stringify(rund)===JSON.stringify(r.KM.P) && JSON.stringify(rund)===roh && roh.length<400000,
    `${(roh.length/1024).toFixed(0)} KB`);
  chk('Ergebnis-Tabellen fuer alle Teile', ['Teil A · Kameras', 'Teil B · AR, dann getUserMedia', 'Teil C · getUserMedia, dann AR', 'Teil D · Ausrichtung', 'beide-laufen',
    'ar-verdraengt-gum', 'portrait-primary', 'Erwartung: '].every(s=>r.text('erg').includes(s)));
  r.klick('btnSichern'); await r.lauf(r.uhr()+100);
  const dl=r.stat.downloads[0], blob=dl && r.stat.urls.get(dl.href), dj=blob ? JSON.parse(await blob.text()) : null;
  chk('Protokoll sichern: Datei kamera-messung-<zeit>.json mit allen Laeufen', dl && dl.download==='kamera-messung-2026-10-26T12-00-00Z.json' && blob.type==='application/json'
    && dj.laeufe.length===4 && dj.gesichert && dj.kopfJetzt, dl && dl.download);
  r.klick('btnTeilen'); await r.lauf(r.uhr()+100);
  const g=r.stat.geteilt[0], gf=g && g.files[0];
  chk('Teilen: navigator.share als Text (.json.txt, text/plain - JSON steht nicht auf Chromes Liste), Inhalt das Protokoll', gf && gf.name==='kamera-messung-2026-10-26T12-00-00Z.json.txt'
    && gf.type==='text/plain' && JSON.parse(await gf.text()).laeufe.length===4 && r.stat.downloads.length===1, gf && `${gf.name} ${gf.type}`);
  chk('(Attrappe) canShare lehnt eine .json-Datei wie Chrome ab', r.ctx.navigator.canShare({files:[new NodeFile(['{}'], 'x.json', {type:'application/json'})]})===false);
  chk('Protokoll-Lauf sauber, danach ruhig', sauber(r) && await ruhig(r), sauberInfo(r));

  // Neuladen: Protokoll bleibt, neuer Aufruf, neuer Lauf haengt sich an; ein unfertiger Lauf wird markiert
  const P2=JSON.parse(roh); P2.laeufe.push({...P2.laeufe[3], nr:2, fertig:false}); ls.set('kamera-messung.protokoll', JSON.stringify(P2));
  const rn=await seite({ls});
  chk('Neuladen: Laeufe bleiben, unfertiger Lauf als abgebrochen markiert, Aufruf gezaehlt', rn.KM.P.laeufe.length===5 && rn.KM.P.aufrufe.length===2
    && /neu geladen/.test(rn.KM.P.laeufe[4].abgebrochen) && /Im Protokoll: 5 Läufe/.test(rn.text('status')) && /abgebrochen/.test(rn.text('erg')));
  rn.klick('btnDh'); await rn.bisFertig();
  const P3=JSON.parse(ls.get('kamera-messung.protokoll'));
  chk('Neuladen: neuer Lauf D3 angehaengt, alte unveraendert', P3.laeufe.length===6 && P3.laeufe[5].teil==='D' && P3.laeufe[5].nr===3 && P3.laeufe[5].fertig
    && JSON.stringify(P3.laeufe.slice(0, 4))===JSON.stringify(P.laeufe) && sauber(rn));
  rn.klick('btnLeeren');
  chk('Protokoll leeren', JSON.parse(ls.get('kamera-messung.protokoll')).laeufe.length===0 && /Noch keine Läufe/.test(rn.text('erg')) && rn.els.get('btnSichern').disabled);
}

chk('keine unbehandelte Ablehnung (Promise) in allen Laeufen', !UNBEHANDELT.length, UNBEHANDELT.slice(0, 2).join(' | '));
console.log(out.join('\n'));
console.log(ok ? '\nALLE CHECKS GRÜN' : '\nCHECKS ROT');
process.exit(ok ? 0 : 1);
