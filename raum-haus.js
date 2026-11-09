// raum-haus.js – Gliederung der Räume in Gebäude und Geschosse für den
// Startbildschirm der Werkzeugfamilie (raeume.html). Begriffe nach
// GLOSSARY.md: Gebäude › Geschoss › Raum.
// Braucht: nichts. Lädt nach raum-speicher.js, hängt aber nicht daran.
"use strict";
// Die Zugehörigkeit legt der Mensch fest. Sie steht deshalb NICHT in den
// Raumdaten (die reisen als Datei und Link und gehören zum Aufmaß), sondern
// unter einem eigenen Schlüssel: raumaufmass.haus. DOM-frei und mit
// injiziertem Storage wie STORE_FACTORY, damit es in Node testbar ist
// (test/raum-haus.mjs).
//
// Gespeicherte Form:
//   { v:1, seq:<Zähler für ids>,
//     gebaeude:[ {id:'b1', name:'Hesterkamp',
//                 geschosse:[ {id:'g2', name:'Erdgeschoss', raeume:[<Raum-id>, …]} ]} ] }
// Reihenfolgen sind fest: Gebäude und Geschosse in der Reihenfolge ihrer
// Anlage, Räume in der Reihenfolge ihrer Zuordnung. Ein Raum, der in keinem
// Geschoss steht, ist ein einzelner Raum und taucht hier gar nicht auf.
//
// Schnittstelle (HAUS_FACTORY(storage) → Objekt):
//   storageOk                               Schreiben möglich?
//   gliederung(raeume, anlage?)             → {gebaeude:[{id,name,geschosse:[{id,name,raeume:[Raum]}]}], einzeln:[Raum]}
//   ort(raumId)                             → {gebaeude:{id,name}, geschoss:{id,name}} oder null
//   ordneZu(raumId, geschossId)             → true/false
//   loese(raumId)                           → true/false (Raum wird einzelner Raum)
//   neuesGebaeude(raumId, name?)            → {gebaeude:id, geschoss:id} oder null
//   neuesGeschoss(gebaeudeId, raumId, name?)→ id oder null
//   benenneGebaeude(id, name)               → true/false
//   benenneGeschoss(id, name)               → true/false
// Gebäude und Geschoss entstehen immer mit einem Raum: leere verschwinden von
// selbst, ein leeres anzulegen hätte also keine Wirkung.
globalThis.HAUS_FACTORY=function makeHaus(storage){
  const K_HAUS='raumaufmass.haus';
  const N_MAX=80;                      // längster Name, wie ihn ein Feld sinnvoll zeigt
  // Namen, die das Raumaufmaß von selbst vergibt. Ein Gebäude soll nicht
  // „Neuer Raum“ heißen, nur weil sein erster Raum nie benannt wurde.
  const PLATZHALTER=new Set(['Unbenannt','Neuer Raum','Mein erster Raum']);

  let storageOk=true;
  try{ storage.setItem(K_HAUS+'.probe','1'); storage.removeItem(K_HAUS+'.probe'); }
  catch(e){ storageOk=false; }

  const leer=()=>({v:1, seq:0, gebaeude:[]});
  const text=s=>typeof s==='string' ? s.trim().slice(0,N_MAX) : '';
  const neueId=(H,vor)=>vor+(++H.seq);

  // Lesen ist die Vertrauensgrenze: der Schlüssel kann von Hand verbogen
  // sein. Was nicht die erwartete Form hat, fällt einzeln weg; ein Raum
  // steht höchstens in einem Geschoss (das erste Vorkommen gilt).
  // null heißt: Schlüssel fehlt oder ist unlesbar - dann steht die
  // Erstbefüllung noch aus.
  function lies(){
    let raw=null;
    try{ raw=storage.getItem(K_HAUS); }catch(e){ return null; }
    if(!raw) return null;
    let o=null;
    try{ o=JSON.parse(raw); }catch(e){ return null; }
    if(!o || typeof o!=='object' || !Array.isArray(o.gebaeude)) return null;
    const H=leer();
    H.seq=(Number.isInteger(o.seq) && o.seq>=0) ? o.seq : 0;
    const ids=new Set(), vergeben=new Set();
    const eigeneId=id=>{
      if(typeof id==='string' && id && !ids.has(id)){
        ids.add(id);
        // Der Zähler darf nie hinter einer vorhandenen id zurückliegen.
        const m=id.match(/^[bg](\d+)$/);
        if(m) H.seq=Math.max(H.seq, +m[1]);
        return id;
      }
      return null;                      // wird unten neu vergeben
    };
    o.gebaeude.forEach(b=>{
      if(!b || typeof b!=='object' || !Array.isArray(b.geschosse)) return;
      const B={id:eigeneId(b.id), name:text(b.name)||'Gebäude', geschosse:[]};
      b.geschosse.forEach(g=>{
        if(!g || typeof g!=='object' || !Array.isArray(g.raeume)) return;
        const G={id:eigeneId(g.id), name:text(g.name)||'Geschoss', raeume:[]};
        g.raeume.forEach(r=>{
          if(typeof r!=='string' || !r || vergeben.has(r)) return;
          vergeben.add(r); G.raeume.push(r);
        });
        B.geschosse.push(G);
      });
      H.gebaeude.push(B);
    });
    H.gebaeude.forEach(B=>{
      if(!B.id){ B.id=neueId(H,'b'); ids.add(B.id); }
      B.geschosse.forEach(G=>{ if(!G.id){ G.id=neueId(H,'g'); ids.add(G.id); } });
    });
    return H;
  }
  function schreib(H){
    try{ storage.setItem(K_HAUS, JSON.stringify(H)); return true; }
    catch(e){ return false; }
  }
  // Aufräumen: verwaiste Raum-ids (nur wenn bekannt ist, welche Räume es
  // gibt), dann leere Geschosse, dann leere Gebäude. true, wenn sich etwas
  // geändert hat.
  function raeumAuf(H, vorhanden){
    let anders=false;
    H.gebaeude.forEach(B=>{
      B.geschosse.forEach(G=>{
        if(!vorhanden) return;
        const n=G.raeume.length;
        G.raeume=G.raeume.filter(id=>vorhanden.has(id));
        if(G.raeume.length!==n) anders=true;
      });
      const n=B.geschosse.length;
      B.geschosse=B.geschosse.filter(G=>G.raeume.length);
      if(B.geschosse.length!==n) anders=true;
    });
    const n=H.gebaeude.length;
    H.gebaeude=H.gebaeude.filter(B=>B.geschosse.length);
    return anders || H.gebaeude.length!==n;
  }
  const nimmHeraus=(H,raumId)=>{
    H.gebaeude.forEach(B=>B.geschosse.forEach(G=>{ G.raeume=G.raeume.filter(id=>id!==raumId); }));
  };
  const findeGeschoss=(H,id)=>{
    for(const B of H.gebaeude) for(const G of B.geschosse) if(G.id===id) return {B,G};
    return null;
  };
  const findeRaum=(H,raumId)=>{
    for(const B of H.gebaeude) for(const G of B.geschosse) if(G.raeume.includes(raumId)) return {B,G};
    return null;
  };
  // Erster freier Name: „Gebäude“, „Gebäude 2“, „Gebäude 3“ …
  const freierName=(basis,belegt)=>{
    if(!belegt.includes(basis)) return basis;
    for(let i=2;;i++) if(!belegt.includes(basis+' '+i)) return basis+' '+i;
  };
  const geschossName=B=>{
    const belegt=B.geschosse.map(G=>G.name);
    if(!belegt.includes('Erdgeschoss')) return 'Erdgeschoss';
    if(!belegt.includes('Obergeschoss')) return 'Obergeschoss';
    return freierName('Geschoss', belegt);
  };

  // Erstbefüllung: Räume, die über gemeinsame Wände verbunden sind, kommen
  // zusammen in ein Geschoss „Erdgeschoss“ eines Gebäudes. Das Gebäude heißt
  // wie der zuerst angelegte Raum der Gruppe; trägt der keinen eigenen
  // Namen, heißt es „Gebäude“. Alle anderen Räume bleiben einzeln.
  function erstfuellung(H, liste, anlage){
    const rang=new Map();
    (Array.isArray(anlage) ? anlage : []).forEach((id,i)=>{ if(!rang.has(id)) rang.set(id,i); });
    // Räume, die in der Anlagereihenfolge fehlen, hinten an, in Listenfolge.
    const basis=rang.size;
    liste.forEach((r,i)=>{ if(!rang.has(r.id)) rang.set(r.id, basis+i); });
    const nachRang=(a,b)=>rang.get(a)-rang.get(b);
    const name=new Map(liste.map(r=>[r.id, text(r.name)]));
    globalThis.HAUS_FACTORY.verbunden(liste)
      .map(gruppe=>gruppe.slice().sort(nachRang))
      .sort((a,b)=>nachRang(a[0],b[0]))
      .forEach(gruppe=>{
        const erster=name.get(gruppe[0]);
        H.gebaeude.push({
          id:neueId(H,'b'),
          name:freierName((erster && !PLATZHALTER.has(erster)) ? erster : 'Gebäude', H.gebaeude.map(B=>B.name)),
          geschosse:[{id:neueId(H,'g'), name:'Erdgeschoss', raeume:gruppe}],
        });
      });
  }

  // Ändern: lesen, anfassen, aufräumen, schreiben - je Aufruf frisch aus dem
  // Speicher, damit zwei offene Fenster einander nicht überschreiben.
  // Wer ändert, hat vorher gliederung() aufgerufen: eine Änderung auf einem
  // noch leeren Schlüssel legt ihn an, und die Erstbefüllung gilt damit als
  // erledigt.
  function aendere(fn){
    const H=lies()||leer();
    const r=fn(H);
    if(r===false || r==null) return r;
    raeumAuf(H, null);
    return schreib(H) ? r : (r===true ? false : null);
  }

  return {
    storageOk,
    // Die Gliederung für eine Raumliste. raeume: Objekte mit id (und name,
    // data für die Erstbefüllung), in der Reihenfolge, in der einzelne Räume
    // erscheinen sollen. anlage: die Raum-ids in der Reihenfolge ihrer Anlage
    // (STORE.allRooms()), nur für die Erstbefüllung gebraucht; fehlt sie,
    // gilt die Reihenfolge von raeume.
    // Räumt beim Lesen auf und schreibt das Ergebnis zurück. Eine LEERE
    // Raumliste räumt nichts weg und füllt nichts: wäre die Raumliste nur
    // gerade unlesbar, wären sonst alle Zuordnungen verloren.
    gliederung(raeume, anlage){
      const liste=(Array.isArray(raeume) ? raeume : []).filter(r=>r && typeof r.id==='string' && r.id);
      let H=lies(), schreiben=false;
      if(!H){
        H=leer();
        if(liste.length){ erstfuellung(H, liste, anlage); schreiben=true; }
      } else if(liste.length){
        schreiben=raeumAuf(H, new Set(liste.map(r=>r.id)));
      }
      if(schreiben) schreib(H);
      const nachId=new Map(liste.map(r=>[r.id,r]));
      const drin=new Set();
      const gebaeude=H.gebaeude.map(B=>({id:B.id, name:B.name,
        geschosse:B.geschosse.map(G=>({id:G.id, name:G.name,
          raeume:G.raeume.filter(id=>nachId.has(id)).map(id=>{ drin.add(id); return nachId.get(id); })}))
          .filter(G=>G.raeume.length)})).filter(B=>B.geschosse.length);
      return {gebaeude, einzeln:liste.filter(r=>!drin.has(r.id))};
    },
    ort(raumId){
      const H=lies();
      const f=H && findeRaum(H, raumId);
      return f ? {gebaeude:{id:f.B.id, name:f.B.name}, geschoss:{id:f.G.id, name:f.G.name}} : null;
    },
    ordneZu(raumId, geschossId){
      if(typeof raumId!=='string' || !raumId) return false;
      return aendere(H=>{
        const f=findeGeschoss(H, geschossId);
        if(!f) return false;
        if(f.G.raeume.includes(raumId)) return true;      // steht schon dort, Platz bleibt
        nimmHeraus(H, raumId);
        f.G.raeume.push(raumId);
        return true;
      });
    },
    loese(raumId){
      return aendere(H=>{ nimmHeraus(H, raumId); return true; });
    },
    neuesGebaeude(raumId, name){
      if(typeof raumId!=='string' || !raumId) return null;
      return aendere(H=>{
        nimmHeraus(H, raumId);
        const B={id:neueId(H,'b'),
                 name:text(name)||freierName('Gebäude', H.gebaeude.map(b=>b.name)),
                 geschosse:[{id:neueId(H,'g'), name:'Erdgeschoss', raeume:[raumId]}]};
        H.gebaeude.push(B);
        return {gebaeude:B.id, geschoss:B.geschosse[0].id};
      });
    },
    neuesGeschoss(gebaeudeId, raumId, name){
      if(typeof raumId!=='string' || !raumId) return null;
      return aendere(H=>{
        const B=H.gebaeude.find(b=>b.id===gebaeudeId);
        if(!B) return null;
        // Erst benennen, dann umziehen: zieht der Raum als letzter aus dem
        // Erdgeschoss aus, soll das neue Geschoss trotzdem nicht so heißen.
        const G={id:neueId(H,'g'), name:text(name)||geschossName(B), raeume:[raumId]};
        nimmHeraus(H, raumId);
        B.geschosse.push(G);
        return G.id;
      });
    },
    benenneGebaeude(id, name){
      const n=text(name);
      if(!n) return false;
      return aendere(H=>{
        const B=H.gebaeude.find(b=>b.id===id);
        if(!B) return false;
        B.name=n; return true;
      });
    },
    benenneGeschoss(id, name){
      const n=text(name);
      if(!n) return false;
      return aendere(H=>{
        const f=findeGeschoss(H, id);
        if(!f) return false;
        f.G.name=n; return true;
      });
    },
  };
};

// Welche Räume hängen über gemeinsame Wände zusammen? Jede geteilte Wand
// steht als data.shared[<Wand>]={room:<id des Nachbarn>, wall:[…]} im Raum
// (raum-modell.js serialize, raumaufmass.html „Wand mit Nachbarraum teilen“
// und „+ hinter der Tür“), in der Regel in beiden Räumen. Gezählt wird die
// Verbindung, sobald EINER auf den anderen zeigt und es beide gibt - wie
// buildingOrigins in raum-geometrie.js, nur ohne Geometrie.
// Rückgabe: die Gruppen mit mindestens zwei Räumen, je als Liste von ids.
globalThis.HAUS_FACTORY.verbunden=function(raeume){
  const liste=(Array.isArray(raeume) ? raeume : []).filter(r=>r && typeof r.id==='string' && r.id);
  const eltern=new Map(liste.map(r=>[r.id, r.id]));
  const wurzel=id=>{
    let w=id;
    while(eltern.get(w)!==w) w=eltern.get(w);
    while(eltern.get(id)!==w){ const n=eltern.get(id); eltern.set(id,w); id=n; }
    return w;
  };
  liste.forEach(r=>{
    const sh=r.data && r.data.shared;
    if(!sh || typeof sh!=='object') return;
    Object.keys(sh).forEach(k=>{
      const zu=sh[k] && sh[k].room;
      if(typeof zu!=='string' || zu===r.id || !eltern.has(zu)) return;
      const a=wurzel(r.id), b=wurzel(zu);
      if(a!==b) eltern.set(b,a);
    });
  });
  const gruppen=new Map();
  liste.forEach(r=>{
    const w=wurzel(r.id);
    if(!gruppen.has(w)) gruppen.set(w,[]);
    gruppen.get(w).push(r.id);
  });
  return [...gruppen.values()].filter(g=>g.length>1);
};

// Im Browser sofort eine an localStorage gebundene Instanz, wie STORE in
// raum-speicher.js: localStorage kann schon beim Zugriff werfen, dann läuft
// die Sitzung im Arbeitsspeicher weiter und storageOk ist falsch.
globalThis.HAUS=(function(){
  try{
    if(typeof localStorage!=='undefined' && localStorage){
      return globalThis.HAUS_FACTORY(localStorage);
    }
  }catch(e){}
  const m=new Map();
  const h=globalThis.HAUS_FACTORY({
    getItem:k=>m.has(k)?m.get(k):null,
    setItem:(k,v)=>m.set(k,String(v)),
    removeItem:k=>m.delete(k),
  });
  h.storageOk=false;
  return h;
})();
