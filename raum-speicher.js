// raum-speicher.js – Raumliste im Browser-Speicher und Link-Kodierung der
// Werkzeugfamilie (docs/adr/0001-familie-mit-geteilten-js-dateien.md).
// Schlüssel raumaufmass.rooms und raumaufmass.current, Links mit #raum=.
// Unverändert aus dem früheren Block "store" von raumaufmass.html.
// Braucht: raum-fremd.js (LZString).
"use strict";
// A room imported as a new copy must not claim a reciprocal connection that
// still belongs to the original room in this or another browser.
globalThis.stripCopiedDoorLinks=function(data){
  if(!data || !data.shared || typeof data.shared!=='object') return data;
  return {...data,shared:Object.fromEntries(Object.entries(data.shared).filter(([,v])=>!v || !v.manuell))};
};
// Raumbibliothek. DOM-frei und mit injiziertem Storage: genau dadurch in
// Node testbar (test/run.mjs), wo es kein localStorage gibt. Alle Eintraege
// leben unter zwei Schluesseln - raumaufmass.rooms (Array) und
// raumaufmass.current (id). Der Alt-Schluessel "raumaufmass" (Einzelraum
// aus der Vor-Bibliothek-Version) wird einmalig migriert.
globalThis.STORE_FACTORY=function makeStore(storage){
  const K_ROOMS='raumaufmass.rooms', K_CUR='raumaufmass.current', K_OLD='raumaufmass';
  // Selbsttest statt Feature-Detection: Private-Mode-Safari hat setItem,
  // wirft aber. Einmal pruefen, Ergebnis als Flag fuer die UI.
  let storageOk=true;
  try{ storage.setItem(K_ROOMS+'.probe','1'); storage.removeItem(K_ROOMS+'.probe'); }
  catch(e){ storageOk=false; }

  const readRooms=()=>{
    try{
      const raw=storage.getItem(K_ROOMS);
      const arr=raw?JSON.parse(raw):[];
      return Array.isArray(arr)?arr:[];
    }catch(e){ return []; }   // kaputtes JSON: leere Bibliothek statt Absturz
  };
  const writeRooms=rooms=>{
    try{ storage.setItem(K_ROOMS, JSON.stringify(rooms)); return true; }
    catch(e){ return false; }
  };
  const newId=()=> (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);

  return {
    storageOk,
    list(){
      // Neueste zuerst. Zwei Anlagen in derselben Millisekunde tragen
      // denselben ISO-Zeitstempel - dann entscheidet die Array-Position:
      // rooms waechst per push, spaeterer Index heisst neuer.
      return readRooms()
        .map((r,i)=>({id:r.id,name:r.name,updated:r.updated,area:r.area??null,stand:r.stand??null,_i:i}))
        .sort((a,b)=>String(b.updated).localeCompare(String(a.updated)) || b._i-a._i)
        .map(({_i,...r})=>r);
    },
    load(id){
      const r=readRooms().find(r=>r.id===id);
      return r?{...r}:null;
    },
    create(name){
      const rooms=readRooms();
      const id=newId();
      rooms.push({id, name:name||'Unbenannt', updated:new Date().toISOString(),
                  area:null, data:{pts:[],walls:[],meas:[],idSeq:0}});
      writeRooms(rooms);
      return id;
    },
    save(id,patch){
      const rooms=readRooms();
      const r=rooms.find(r=>r.id===id);
      if(!r) return false;
      if(patch.name!==undefined) r.name=patch.name;
      if(patch.data!==undefined) r.data=patch.data;
      if(patch.area!==undefined) r.area=patch.area;
      // Stand des Aufmaßes in Kurzform {tone,text}: der Startbildschirm zeigt
      // ihn, ohne den Raum durchzurechnen.
      if(patch.stand!==undefined) r.stand=patch.stand;
      // origin liegt bewusst NEBEN data: die Lage im Gebaeude gehoert nicht
      // zum Aufmass des Raums. Datei-Export, Link und Undo arbeiten ueber
      // data - die Verankerung darf dabei weder mitreisen noch verloren
      // gehen (recompute speichert je Aenderung nur data und area).
      if(patch.origin!==undefined) r.origin=patch.origin;
      r.updated=new Date().toISOString();
      return writeRooms(rooms);
    },
    rename(id,name){ return this.save(id,{name}); },
    // Alle im Gebaeude verankerten Raeume, mit Daten: der aktive Raum
    // zeichnet daraus seine Nachbarn. Raeume ohne origin sind freistehend
    // und tauchen hier nie auf - die bestehende Bibliothek bleibt gueltig.
    withOrigin(){
      return readRooms().filter(r=>r && r.origin && typeof r.origin==='object')
                        .map(r=>({id:r.id, name:r.name, origin:r.origin, data:r.data}));
    },
    // Alle Raeume mit Daten. buildingOrigins entscheidet selbst, wer im
    // Gebaeude liegt - eine Verbindung kann einen Raum platzieren, der nie
    // ein eigenes origin bekommen hat.
    allRooms(){
      return readRooms().filter(Boolean)
                        .map(r=>({id:r.id, name:r.name, origin:r.origin, data:r.data}));
    },
    // Beide Raumseiten in einem einzigen localStorage-Schreibvorgang ändern.
    // Eine Wand kann derzeit nur eine Raumverbindung tragen.
    linkDoors(id, data, opId, otherId, otherOpId, thickness){
      const rooms=readRooms(), a=rooms.find(r=>r.id===id), b=rooms.find(r=>r.id===otherId);
      if(!a || !b || a===b || !data || !b.data) return {ok:false, reason:'Raum nicht gefunden.'};
      const door=(d,i)=>Array.isArray(d.openings) && d.openings.filter(o=>o && o.id===i && o.kind==='door');
      const aa=door(data,opId), bb=door(b.data,otherOpId);
      if(!aa || aa.length!==1 || !bb || bb.length!==1) return {ok:false, reason:'Tür nicht eindeutig gefunden.'};
      const x=aa[0], y=bb[0], key=o=>[o.a,o.b].sort().join('|'), k=key(x), j=key(y);
      const wall=(d,o)=>Array.isArray(d.walls) && d.walls.some(w=>Array.isArray(w) && key({a:w[0],b:w[1]})===key(o));
      if(!wall(data,x) || !wall(b.data,y)) return {ok:false, reason:'Eine Tür hat keine gültige Wand.'};
      if((data.shared||{})[k] || (b.data.shared||{})[j]) return {ok:false, reason:'Eine der Wände ist bereits verbunden.'};
      const t=Number(thickness);
      if(!Number.isFinite(t) || t<20 || t>1000) return {ok:false, reason:'Wanddicke muss zwischen 20 und 1000 mm liegen.'};
      a.data={...data, shared:{...(data.shared||{}),[k]:{room:b.id,wall:[y.a,y.b],tuer:{op:x.id},manuell:true}}, thick:{...(data.thick||{}),[k]:t}};
      b.data={...b.data, shared:{...(b.data.shared||{}),[j]:{room:a.id,wall:[x.a,x.b],tuer:{op:y.id},manuell:true}}, thick:{...(b.data.thick||{}),[j]:t}};
      a.updated=b.updated=new Date().toISOString();
      return writeRooms(rooms) ? {ok:true} : {ok:false, reason:'Verbindung konnte nicht gespeichert werden.'};
    },
    unlinkDoors(id, data, wall){
      const rooms=readRooms(), a=rooms.find(r=>r.id===id), sh=data && data.shared && data.shared[wall];
      if(!a || !sh || !sh.manuell || !Array.isArray(sh.wall)) return {ok:false, reason:'Verbindung nicht gefunden.'};
      const b=rooms.find(r=>r.id===sh.room), k=[...sh.wall].sort().join('|');
      const back=b && b.data && b.data.shared && b.data.shared[k];
      if(b && (!back || !back.manuell || back.room!==id)) return {ok:false, reason:'Die Gegenseite hat sich geändert; bitte Raum neu laden.'};
      const shared={...data.shared}; delete shared[wall];
      a.data={...data,shared}; a.updated=new Date().toISOString();
      if(b){ const s={...b.data.shared}; delete s[k]; b.data={...b.data,shared:s}; b.updated=a.updated; }
      return writeRooms(rooms) ? {ok:true} : {ok:false, reason:'Verbindung konnte nicht gelöst werden.'};
    },
    remove(id){
      const remaining=readRooms().filter(r=>r.id!==id);
      remaining.forEach(r=>{
        const shared=r.data && r.data.shared;
        if(!shared) return;
        const next={...shared}; let changed=false;
        Object.keys(next).forEach(k=>{ if(next[k] && next[k].manuell && next[k].room===id){ delete next[k]; changed=true; } });
        if(changed) r.data={...r.data,shared:next};
      });
      writeRooms(remaining);
      if(this.currentId()===id){
        try{ storage.removeItem(K_CUR); }catch(e){}
      }
    },
    currentId(){
      try{ return storage.getItem(K_CUR); }catch(e){ return null; }
    },
    setCurrent(id){
      try{ storage.setItem(K_CUR,id); }catch(e){}
    },
    migrate(){
      let old=null;
      try{ old=storage.getItem(K_OLD); }catch(e){ return false; }
      if(!old) return false;
      let data=null;
      try{ data=JSON.parse(old); }catch(e){}
      try{ storage.removeItem(K_OLD); }catch(e){}
      if(!data || !Array.isArray(data.pts)) return false;
      const rooms=readRooms();
      rooms.push({id:newId(), name:'Unbenannt', updated:new Date().toISOString(),
                  area:null, data});
      writeRooms(rooms);
      return true;
    },
  };
};
// Teilen-Link: Zustand -> JSON -> lz-string -> URL-Fragment. Das Fragment
// verlaesst den Browser nie (geht an keinen Server) - Persistenz und
// Weitergabe ohne jede Infrastruktur. decode ist die Vertrauensgrenze:
// jeder Muell ergibt null, nie eine Exception; die inhaltliche Pruefung
// macht danach importProblem() in der UI.
globalThis.encodeShare=function(room){
  return LZString.compressToEncodedURIComponent(JSON.stringify({name:room.name, data:room.data}));
};
globalThis.decodeShare=function(s){
  if(!s || typeof s!=='string') return null;
  let json=null;
  try{ json=LZString.decompressFromEncodedURIComponent(s); }catch(e){ return null; }
  if(!json) return null;
  try{
    const o=JSON.parse(json);
    if(!o || typeof o!=='object' || !o.data || typeof o.data!=='object') return null;
    return {name:typeof o.name==='string'?o.name:'Geteilter Raum', data:o.data};
  }catch(e){ return null; }
};
globalThis.parseShareFragment=function(hash){
  if(typeof hash!=='string') return null;
  const m=hash.match(/^#raum=(.+)$/);
  return m ? globalThis.decodeShare(m[1]) : null;
};

// Im Browser sofort eine an localStorage gebundene Instanz; in Node bleibt
// nur die Factory (die Checks injizieren sich ihren eigenen Speicher).
// localStorage kann beim blossen ZUGRIFF werfen (Chrome "alle Cookies
// blockieren": SecurityError am Getter - typeof schuetzt davor nicht).
// Dann laeuft die Sitzung im Speicher weiter: alles funktioniert, nur
// ueberlebt nichts den Reload - storageOk:false treibt den Hinweis.
globalThis.STORE=(function(){
  try{
    if(typeof localStorage!=='undefined' && localStorage){
      return globalThis.STORE_FACTORY(localStorage);
    }
  }catch(e){}
  const m=new Map();
  const st=globalThis.STORE_FACTORY({
    getItem:k=>m.has(k)?m.get(k):null,
    setItem:(k,v)=>m.set(k,String(v)),
    removeItem:k=>m.delete(k),
  });
  st.storageOk=false;
  return st;
})();
