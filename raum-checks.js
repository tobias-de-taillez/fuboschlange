// raum-checks.js – Selbstchecks der Werkzeugfamilie (Raumaufmaß, Fliesen,
// Küche). Unverändert aus dem früheren Block "checks" von raumaufmass.html;
// legt globalThis.selfChecks an. node test/run.mjs führt sie aus, im Browser
// laufen sie mit raumaufmass.html?test.
// Braucht: raum-fremd.js, raum-kern.js, raum-fliesen.js, raum-kueche.js,
// raum-geometrie.js, raum-speicher.js. Lädt als letztes Skript der Seite.
"use strict";
// Die Assert-Funktion heisst chk, nicht A - in mehreren Tests weiter unten
// heisst eine Matrix A, und der Name darf nicht spaeter wandern muessen.
globalThis.selfChecks=function(){
  const C=globalThis.CORE, out=[]; let ok=true;
  const chk=(n,c)=>{ ok=ok&&!!c; out.push((c?'PASS ':'FAIL ')+n); };
  const near=(a,b,t)=>Math.abs(a-b)<=t;
  // --- residuals ---
  {
    const pts=[{id:'A',x:0,y:0},{id:'B',x:3000,y:4000}];
    const meas=[{a:'A',b:'B',d:5000},{a:'A',b:'B',d:4980}];
    const v=C.residuals(pts,meas);
    chk('residuals: exakte Messung -> 0', near(v[0],0,1e-9));
    chk('residuals: 20mm zu kurz gemessen -> +20', near(v[1],20,1e-9));
  }
  {
    const pts=[{id:'A',x:0,y:0},{id:'B',x:1000,y:0}];
    const meas=[{a:'A',b:'B',d:900},{a:'A',b:'B',d:800,on:false}];
    chk('residuals: on:false wird ignoriert', C.residuals(pts,meas).length===1);
  }
  // --- jacobian ---
  {
    const pts=[{id:'A',x:0,y:0},{id:'B',x:1000,y:0}];
    const J=C.jacobian(pts,[{a:'A',b:'B',d:900}]);
    chk('jacobian: Form 1x4', J.length===1 && J[0].length===4);
    chk('jacobian: waagerechte Kante -> [-1,0,1,0]',
      near(J[0][0],-1,1e-9)&&near(J[0][1],0,1e-9)&&near(J[0][2],1,1e-9)&&near(J[0][3],0,1e-9));
  }
  {
    // Starrbewegungen liegen im Nullraum: J*t = 0 fuer Translation und Drehung
    const pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:1500,y:2500}];
    const meas=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:1},{a:'C',b:'A',d:1}];
    const J=C.jacobian(pts,meas);
    const tx=[],ty=[],rot=[];
    pts.forEach(p=>{ tx.push(1,0); ty.push(0,1); rot.push(-p.y,p.x); });
    const mul=(row,t)=>row.reduce((s,x,i)=>s+x*t[i],0);
    chk('jacobian: Translation x im Nullraum', J.every(r=>near(mul(r,tx),0,1e-9)));
    chk('jacobian: Translation y im Nullraum', J.every(r=>near(mul(r,ty),0,1e-9)));
    chk('jacobian: Drehung im Nullraum',       J.every(r=>near(mul(r,rot),0,1e-9)));
  }
  // --- luSolve / matTmat / matTvec ---
  {
    const A=[[2,1],[1,3]], B=[[3],[5]];        // Loesung x=(0.8, 1.4)
    const X=C.luSolve(A,B);
    chk('luSolve: 2x2 korrekt', near(X[0][0],0.8,1e-9)&&near(X[1][0],1.4,1e-9));
    chk('luSolve: singulaer -> null', C.luSolve([[1,2],[2,4]],[[1],[2]])===null);
    chk('luSolve: mehrere rechte Seiten', (()=>{
      const Y=C.luSolve([[2,0],[0,4]],[[2,4],[4,8]]);
      return near(Y[0][0],1,1e-9)&&near(Y[0][1],2,1e-9)&&near(Y[1][0],1,1e-9)&&near(Y[1][1],2,1e-9);
    })());
    chk('luSolve: Pivotierung noetig (Null auf der Diagonalen)', (()=>{
      const Y=C.luSolve([[0,1],[1,0]],[[3],[5]]);
      return Y && near(Y[0][0],5,1e-9) && near(Y[1][0],3,1e-9);
    })());
  }
  {
    const M=[[1,2],[3,4]];
    const N=C.matTmat(M);                      // [[10,14],[14,20]]
    chk('matTmat korrekt', N[0][0]===10&&N[0][1]===14&&N[1][0]===14&&N[1][1]===20);
    const g=C.matTvec(M,[1,1]);                // [4,6]
    chk('matTvec korrekt', g[0]===4&&g[1]===6);
  }
  // --- gramSchmidt / nullSpace / leverage ---
  {
    const M=[[1,0,1],[0,1,1],[0,0,0]];         // Spalte 3 = Spalte 1 + Spalte 2
    const gs=C.gramSchmidt(M);
    chk('gramSchmidt: Rang 2 erkannt', gs.rank===2);
    chk('gramSchmidt: Pivotspalten 0 und 1', gs.piv[0]===0&&gs.piv[1]===1);
    chk('gramSchmidt: Q orthonormal', (()=>{
      const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
      return near(dot(gs.Q[0],gs.Q[0]),1,1e-9)&&near(dot(gs.Q[1],gs.Q[1]),1,1e-9)
          && near(dot(gs.Q[0],gs.Q[1]),0,1e-9);
    })());
    const ns=C.nullSpace(gs);
    chk('nullSpace: eine Dimension', ns.length===1);
    chk('nullSpace: M*z = 0', (()=>{
      const z=ns[0];
      return M.every(r=>near(r.reduce((s,x,i)=>s+x*z[i],0),0,1e-9));
    })());
  }
  {
    const I3=[[1,0,0],[0,1,0],[0,0,1]];        // voller Rang -> h_i = 1
    const h=C.leverage(C.gramSchmidt(I3));
    chk('leverage: voller Rang -> h=1', h.every(x=>near(x,1,1e-9)));
    // eine Spalte, drei gleiche Zeilen -> h_i = 1/3
    const h2=C.leverage(C.gramSchmidt([[1],[1],[1]]));
    chk('leverage: 3 gleiche Zeilen -> h=1/3', h2.every(x=>near(x,1/3,1e-9)));
    chk('leverage: Summe h = Rang', near(h2.reduce((s,x)=>s+x,0),1,1e-9));
  }
  {
    const gs=C.gramSchmidt([[0,0],[0,0]]);     // Nullmatrix
    chk('gramSchmidt: Nullmatrix -> Rang 0', gs.rank===0);
    chk('nullSpace: Nullmatrix -> volle Dimension', C.nullSpace(gs).length===2);
    chk('leverage: Rang 0 -> h=0', C.leverage(gs).every(x=>x===0));
  }
  // --- Eichung ---
  {
    // P1 liegt weit rechts von P0 -> P1.y (Spalte 3) pinnen
    const waag=[{id:'A',x:0,y:0},{id:'B',x:5000,y:10},{id:'C',x:0,y:3000}];
    chk('gauge: waagerechtes Paar pinnt P1.y',
       JSON.stringify(C.gaugeFixed(waag))===JSON.stringify([0,1,3]));
    // P1 liegt senkrecht ueber P0 -> P1.y taugt nicht, P1.x (Spalte 2) pinnen
    const senk=[{id:'A',x:0,y:0},{id:'B',x:0,y:5000},{id:'C',x:3000,y:0}];
    chk('gauge: senkrechtes Paar pinnt P1.x',
       JSON.stringify(C.gaugeFixed(senk))===JSON.stringify([0,1,2]));
    chk('freeCols: 2n-3 freie Spalten', C.freeCols(waag).length===2*3-3);
    chk('freeCols: enthaelt keine gepinnte Spalte',
       C.freeCols(waag).every(c=>![0,1,3].includes(c)));
    chk('gauge: unter 2 Punkten nichts zu pinnen', C.gaugeFixed([{id:'A',x:0,y:0}]).length===0);
  }
  {
    // Die entscheidende Eigenschaft: keine Starrbewegung ueberlebt das Pinnen.
    // Waere sie noch da, saehe jedes Netz beweglich aus.
    const pts=[{id:'A',x:0,y:0},{id:'B',x:0,y:5000},{id:'C',x:3000,y:0}];
    const fx=C.gaugeFixed(pts);
    const tx=[],ty=[],rot=[];
    pts.forEach(p=>{ tx.push(1,0); ty.push(0,1); rot.push(-p.y,p.x); });
    chk('gauge: jede Starrbewegung bewegt mindestens eine gepinnte Koordinate',
       [tx,ty,rot].every(t=>fx.some(c=>Math.abs(t[c])>1e-9)));
  }
  // --- solve ---
  {
    // Rechteck 4000 x 3000, Skizze grob und viel zu klein, exakte Messungen.
    const truth=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const sketch=[{id:'A',x:0,y:0},{id:'B',x:40,y:3},{id:'C',x:38,y:33},{id:'D',x:-2,y:29}];
    const meas=[
      {a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000},
      {a:'A',b:'C',d:5000},
    ];
    const r=C.solve(sketch,meas);
    chk('solve: konvergiert', r.converged);
    chk('solve: exakte Messungen -> Residuen ~0',
       C.residuals(r.pts,meas).every(v=>Math.abs(v)<0.01));
    // Eichfrei pruefen. Lage und Drehung erbt das Ergebnis von der Skizze -
    // ein Vergleich absoluter Koordinaten wuerde fehlschlagen, obwohl die
    // Form exakt stimmt. Verglichen werden deshalb Abstaende.
    const IR=C.idx(r.pts), IT=C.idx(truth);
    let worst=0;
    for(let i=0;i<4;i++) for(let j=i+1;j<4;j++){
      const a=truth[i].id, b=truth[j].id;
      worst=Math.max(worst,
        Math.abs(C.dist(r.pts[IR[a]],r.pts[IR[b]]) - C.dist(truth[IT[a]],truth[IT[b]])));
    }
    chk('solve: Form exakt getroffen (alle Abstaende <0.01mm)', worst<0.01);
    chk('solve: ungemessene Diagonale B-D kommt auf 5000 heraus',
       near(C.dist(r.pts[IR['B']],r.pts[IR['D']]),5000,0.01));
    chk('solve: Eingabe unveraendert', sketch[1].x===40);
  }
  {
    // Echte Dusche vom 5.11.2026: A-B ist ein 4-mm-Versatz. Mit P1=pts[1]
    // hing die Drehung des Raums an diesem Hebel, LM kroch 30 Schritte und
    // meldete "nicht konvergiert" - bei einwandfreien Daten (sigma ~4 mm).
    const P={A:[1522.9,2062.3],B:[1519.0,2060.5],C:[2664.8,2054.7],D:[2636.7,878.6],E:[2000.0,896.2],
      F:[1765.8,1298.5],G:[971.8,1305.1],H:[806.7,1665.7],I:[1347.1,2061.9],J:[1783.5,1405.5],
      K:[1932.6,1396.1],L:[1936.3,1544.7],M:[1786.6,1555.6]};
    const pts=Object.entries(P).map(([id,[x,y]])=>({id,x,y}));
    const meas=('JK150 KL150 LM150 MJ150 CD1176 DE638 FG792 GH398 HI671 IA177 AB1 BC1142 CE1331 '
      +'LD968 LC890 LB665 AL665 GC1857 EJ553 JD1004 HJ1013 AF799 HL1135 CK987 CI1316 CF1175 '
      +'FH1023 GB928 IF866 FD960 EF460 IG845 AK782 MD1090 MC1010 AD1623 BD1623 BE1257 AE1257 '
      +'ID1755 ME696 KE509 KH1159 ME700 MD1088 BE1260 MB578 AM578').split(' ')
      .map(s=>({a:s[0], b:s[1], d:+s.slice(2), sigma:5}));
    chk('gauge: P1 ist der fernste Messpartner von P0 (D, nicht B)',
       C.gaugeFixed(pts, meas)[2]>>1===C.idx(pts)['D']);
    const r=C.solve(pts, meas);
    chk('solve: Dusche mit 4-mm-Wand konvergiert', r.converged, r.iters);
    // Festgelegte Werte duerfen die Konvergenz nicht kosten (FIX_WT-Kondition).
    const mf=meas.map(m=>['CD','BC','DE'].includes(m.a+m.b) ? {...m, fix:true} : m);
    const rf=C.solve(pts, mf, [{a:'B',c:'C',b:'D',deg:90},{a:'C',c:'D',b:'E',deg:90}]);
    chk('solve: Dusche mit 3 exakten Massen und 2 festen Winkeln konvergiert', rf.converged, rf.iters);
  }
  // --- Festgelegte Winkel und exakte Masse ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4100,y:50},{id:'C',x:3900,y:3100},{id:'D',x:-50,y:2900}];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    const ang=[{a:'A',c:'B',b:'C',deg:90}];
    chk('winkel: 4 Seiten -> 1 Messung fehlt', C.analyze(rect,seiten).dof===1);
    chk('winkel: fester 90-Grad-Winkel ersetzt die fehlende Messung', C.analyze(rect,seiten,ang).dof===0);
    const r=C.solve(rect,seiten,ang), I=C.idx(r.pts);
    chk('winkel: konvergiert, ungemessene Diagonale kommt auf 5000',
       r.converged && near(C.dist(r.pts[I.A],r.pts[I.C]),5000,0.05), C.dist(r.pts[I.A],r.pts[I.C]));
    chk('winkel: 100 Grad werden exakt getroffen',
       near(C.angleDeg(C.solve(rect,seiten,[{a:'A',c:'B',b:'C',deg:100}]).pts,{a:'A',c:'B',b:'C'}),100,0.01));
    // Analytische Jacobi-Zeile gegen Differenzenquotient - am Zielwinkel,
    // wo der als konstant genommene Schenkelfaktor nicht hineinspielt.
    const g={a:'A',c:'B',b:'C',deg:C.angleDeg(rect,{a:'A',c:'B',b:'C'})};
    const J=C.jacobian(rect,[],[g])[0];
    let worst=0;
    for(let k=0;k<8;k++){
      const Q=rect.map(p=>({...p})), q=Q[k>>1];
      if(k&1) q.y+=1e-4; else q.x+=1e-4;
      worst=Math.max(worst, Math.abs(C.residuals(Q,[],[g])[0]/1e-4-J[k]));
    }
    chk('winkel: Jacobi-Zeile stimmt mit Differenzenquotient', worst<1e-3, worst);
    chk('winkel: Eintrag mit fehlendem Punkt faellt still weg',
       C.analyze(rect,seiten,[{a:'A',c:'X',b:'C',deg:90}]).dof===1);
    // Exakt gegen widersprechende Wiederholung: der festgelegte Wert haelt,
    // und er wird nie verdaechtigt - der Fehler landet bei der Wiederholung.
    const ms=seiten.concat([{a:'A',b:'C',d:5000},{a:'B',b:'D',d:5000},{a:'A',b:'B',d:4030}]);
    ms[0]={...ms[0], fix:true};
    const rf=C.solve(rect,ms), an=C.analyze(rf.pts,ms), IF=C.idx(rf.pts);
    chk('exakt: festgelegtes Mass haelt gegen eine Wiederholung',
       near(C.dist(rf.pts[IF.A],rf.pts[IF.B]),4000,0.1), C.dist(rf.pts[IF.A],rf.pts[IF.B]));
    chk('exakt: festgelegtes Mass hat w=null, die Wiederholung traegt den Fehler',
       an.w[0]===null && an.w[6]>3, an.w[6]);
    chk('exakt: v ist ungewichtet in mm', near(an.v[6],-30,0.5), an.v[6]);
  }
  {
    // Unterbestimmt: 4 Punkte, nur 2 Messungen. Muss zeichenbar bleiben.
    const sketch=[{id:'A',x:0,y:0},{id:'B',x:100,y:0},{id:'C',x:100,y:80},{id:'D',x:0,y:80}];
    const r=C.solve(sketch,[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000}]);
    chk('solve: unterbestimmt liefert endliche Koordinaten',
       r.pts.every(p=>isFinite(p.x)&&isFinite(p.y)));
    chk('solve: unterbestimmt erfuellt die vorhandenen Messungen',
       C.residuals(r.pts,[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000}]).every(v=>Math.abs(v)<0.5));
  }
  {
    chk('solve: ohne Messungen kein Absturz',
       C.solve([{id:'A',x:0,y:0},{id:'B',x:10,y:0}],[]).pts.length===2);
    const s=C.scaleSketch([{id:'A',x:0,y:0},{id:'B',x:10,y:0}],[{a:'A',b:'B',d:5000}]);
    chk('scaleSketch: auf Messgroesse gestreckt', near(s[1].x,5000,1e-6));
  }
  // --- analyze: fehlende Messungen (Spec-Test 2) ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    chk('analyze: Rechteck mit 4 Seiten -> 1 Messung fehlt', C.analyze(rect,seiten).dof===1);
    chk('analyze: mit Diagonale -> 0 Messungen fehlen',
       C.analyze(rect,seiten.concat([{a:'A',b:'C',d:5000}])).dof===0);
    chk('analyze: 4 Seiten -> genau ein Flex-Mode', C.analyze(rect,seiten).modes.length===1);
  }
  // --- analyze: Modeform ist echt, nicht nur gezaehlt (Review-Finding 2) ---
  {
    // Gleiches Rechteck, gleiche vier Seiten -> genau ein Flex-Mode (siehe oben).
    // Eine vertauschte Ruecktransformation (f[i]=z[c] statt f[c]=z[i]) waere mit
    // "modes.length===1" allein nicht zu erwischen - deshalb hier die Form pruefen.
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    const an=C.analyze(rect,seiten);
    const n2=2*rect.length;
    // length===1 explizit mittesten: modes.every(...) ist auf [] vakuos wahr,
    // die Form-Checks unten waeren sonst kein Test, sondern nur Dekoration.
    chk('analyze: genau ein Mode-Vektor, Laenge 2n',
       an.modes.length===1 && an.modes.every(z=>z.length===n2));
    const fixed=C.gaugeFixed(rect, seiten);
    chk('analyze: Mode-Vektor ist 0 an den gepinnten Spalten',
       an.modes.every(z=>fixed.every(c=>z[c]===0)));
    const J=C.jacobian(rect,seiten);
    chk('analyze: Mode-Vektor liegt im Nullraum der Jacobi-Matrix (J*z ~ 0)',
       an.modes.every(z=>J.every(row=>near(row.reduce((s,x,i)=>s+x*z[i],0),0,1e-9))));
  }
  // --- analyze: Moden ohne jede Messung (Review-Finding 1) ---
  {
    // gramSchmidt sieht bei 0 Zeilen keine Spalten (k=0) und nullSpace liefert
    // dann faelschlich []. analyze kennt die Spaltenzahl (nf) aber genau: ohne
    // jede Messung ist jede freie Koordinate ein Flex-Mode.
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const an=C.analyze(rect,[]);
    chk('analyze: ohne Messungen -> modes.length = dof', an.modes.length===an.dof);
  }
  // --- analyze: sigma-Gewichtung wirkt pro Messung (Review-Finding 3) ---
  {
    // Ueberbestimmtes Netz, eine Messung absichtlich leicht verstimmt (v!=0),
    // damit "sigma verdoppelt -> w halbiert" keine 0/2=0-Nullaussage ist.
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const voll=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                {a:'D',b:'A',d:3010},{a:'A',b:'C',d:5000},{a:'B',b:'D',d:5000}];
    const sigma5=voll.map(m=>({...m, sigma:5}));
    // sigma geht seit der Gewichtung auch in die Hutmatrix ein: eine EINZELNE
    // Messung mit doppeltem sigma verschiebt die Redundanzanteile, w halbiert
    // sich dann nicht mehr glatt. Wohl aber, wenn ALLE sigma doppelt sind -
    // dann bleibt die Geometrie gleich und nur der Massstab der Erwartung waechst.
    const sigma10=sigma5.map(m=>({...m, sigma:10}));
    const w5=C.analyze(rect,sigma5).w, w10=C.analyze(rect,sigma10).w;
    chk('analyze: alle sigma verdoppelt -> jedes w halbiert',
       w5.every((x,i)=>near(w10[i], x/2, 1e-9)));
    const einzeln=sigma5.map((m,i)=>i===3 ? {...m, sigma:10} : m);
    const an1=C.analyze(rect,einzeln), an0=C.analyze(rect,sigma5);
    chk('analyze: groesseres sigma -> groesserer Redundanzanteil dieser Messung',
       an1.red[3]>an0.red[3], an1.red[3]+' vs '+an0.red[3]);
  }
  // --- solve: sigma gewichtet (Laufmessung gegen Laser) ---
  {
    // Rechteck vollstaendig mit dem Laser gemessen, dazu eine Laufmessung
    // (sigma 200) der Diagonale, 150 mm daneben. Vorher zog sie so stark wie
    // ein Laserwert und verbog die Form um Dutzende Millimeter.
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const laser=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                 {a:'D',b:'A',d:3000},{a:'A',b:'C',d:5000}].map(m=>({...m, sigma:5}));
    const lauf={a:'B',b:'D',d:5150,sigma:200};
    const r=C.solve(rect, laser.concat([lauf])), I=C.idx(r.pts);
    const bd=C.dist(r.pts[I.B],r.pts[I.D]);
    chk('solve: Laufmessung (sigma 200) verbiegt den Laser-Grundriss kaum', Math.abs(bd-5000)<1, bd);
    const an=C.analyze(r.pts, laser.concat([lauf]));
    chk('solve: Laufmessung traegt ihr Residuum selbst, ohne Ausreisser zu sein',
       near(an.v[5],-150,2) && an.w[5]<1, an.v[5]+' / w '+an.w[5]);
  }
  // --- analyze: der Luegner-Fall (Spec-Test 3) ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const exakt=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                 {a:'D',b:'A',d:3000},{a:'A',b:'C',d:5000}];        // m = 2n-3 = 5
    const an=C.analyze(rect,exakt);
    // Laenge vor jedem .every()/Math.min(...) explizit mitpruefen (Review-
    // Finding 5): .every() ist auf [] vakuos wahr und Math.min() ohne
    // Argumente ist +Infinity, also > jede Schranke. Ein Mutant, der z.B. nur
    // das zurueckgegebene v auf [] setzt (w, red, sigmaHat bleiben korrekt),
    // waere ohne diese Laengenchecks von keinem der Checks unten zu fangen -
    // ausgerechnet im Block, um den es im ganzen Werkzeug geht.
    chk('analyze: exakt bestimmt -> v hat 5 Eintraege (einen je Messung)', an.v.length===exakt.length);
    chk('analyze: exakt bestimmt -> alle Residuen ~0', an.v.every(x=>Math.abs(x)<1e-6));
    chk('analyze: exakt bestimmt -> Redundanz 0', an.redundancy===0);
    chk('analyze: exakt bestimmt -> w hat 5 Eintraege', an.w.length===exakt.length);
    chk('analyze: exakt bestimmt -> KEINE Messung pruefbar', an.w.every(x=>x===null));
    chk('analyze: exakt bestimmt -> sigmaHat undefiniert', an.sigmaHat===null);
    // Mit beiden Diagonalen ist jede Messung pruefbar - Grundlage des
    // Browser-Checks in Task 11. Summe der Redundanzzahlen = m - rank = 1.
    const voll=exakt.concat([{a:'B',b:'D',d:5000}]);
    const av=C.analyze(rect,voll);
    chk('analyze: 6 Messungen -> red hat 6 Eintraege', av.red.length===voll.length);
    chk('analyze: 6 Messungen -> jede pruefbar', Math.min(...av.red)>C.TOL_RED);
    chk('analyze: Summe der Redundanzzahlen = m - rank',
       near(av.red.reduce((s,x)=>s+x,0), av.m-av.rank, 1e-9));
  }
  // --- analyze: widerspruechliches bestimmtes Netz ist von einem
  // konsistenten bestimmten Netz unterscheidbar (Review-Finding 1).
  // redundancy===0 ist in beiden Faellen gleich, w ist in beiden Faellen
  // ueberall null - "nicht pruefbar" gilt fuer beide identisch und reicht
  // daher nicht, um sie auseinanderzuhalten. Der Unterschied liegt in der
  // GROESSE der Residuen: ein Zahlendreher (hier A-C: 8000 statt korrekt
  // 5000 im 3-4-5-Rechteck) kann vom Fit nicht aufgeloest werden und
  // hinterlaesst Residuen weit ausserhalb dessen, was Messrauschen erklaeren
  // kann - das ist genau der Beweis, den statusText() jetzt nutzt.
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const widerspruch=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                 {a:'D',b:'A',d:3000},{a:'A',b:'C',d:8000}];   // A-C vertippt: 8000 statt 5000
    const fit=C.solve(rect.map(p=>({...p})), widerspruch);
    const an=C.analyze(fit.pts, widerspruch);
    chk('analyze: widerspruechliches Netz -> trotzdem bestimmt (Redundanz 0)', an.redundancy===0);
    chk('analyze: widerspruechliches Netz -> v hat 5 Eintraege', an.v.length===widerspruch.length);
    chk('analyze: widerspruechliches Netz -> Residuen weit ausserhalb des Messrauschens',
       Math.max(...an.v.map(Math.abs)) > 20*C.SIGMA_DEF);

    const konsistent=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                 {a:'D',b:'A',d:3000},{a:'A',b:'C',d:5000}];
    const anK=C.analyze(rect, konsistent);
    chk('analyze: konsistentes bestimmtes Netz -> ebenfalls Redundanz 0 (Gegenprobe)', anK.redundancy===0);
    chk('analyze: konsistentes bestimmtes Netz -> Residuen ~0',
       Math.max(...anK.v.map(Math.abs)) < 1e-6);
    chk('analyze: beide Netze an "redundancy" ununterscheidbar, aber am Residuum klar getrennt',
       an.redundancy===anK.redundancy &&
       Math.max(...an.v.map(Math.abs)) > 1000*Math.max(...anK.v.map(Math.abs), 1e-9));
  }
  // --- analyze: Ausreisser (Spec-Test 1) ---
  {
    const L=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
             {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
    const paare=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A'],
                 ['A','C'],['A','D'],['A','E'],['B','D'],['D','F'],['C','F']];
    const I=C.idx(L);
    const exakt=paare.map(([a,b])=>({a,b,d:C.dist(L[I[a]],L[I[b]]),sigma:5}));
    const mit=exakt.map((m,i)=>i===7 ? {...m, d:m.d+20} : {...m});   // A-D um 20mm falsch
    const fit=C.solve(L.map(p=>({...p})), mit);
    const an=C.analyze(fit.pts, mit);
    const wmax=an.w.reduce((bi,x,i,arr)=>(x??-1)>(arr[bi]??-1)?i:bi,0);
    chk('analyze: der verfaelschte Wert hat das groesste w', wmax===7);
    chk('analyze: rank 9', an.rank===9);
    chk('analyze: ueberbestimmt -> sigmaHat vorhanden', an.sigmaHat!==null && an.sigmaHat>0);
    chk('analyze: ueberbestimmt -> jede Messung pruefbar', an.w.every(x=>x!==null));

    // Formfehler eichfrei ueber alle Punktabstaende
    const formErr=P=>{
      const IP=C.idx(P); let w=0;
      for(let i=0;i<6;i++) for(let j=i+1;j<6;j++){
        const a=L[i].id, b=L[j].id;
        w=Math.max(w, Math.abs(C.dist(P[IP[a]],P[IP[b]]) - C.dist(L[I[a]],L[I[b]])));
      }
      return w;
    };
    // Bei nur 3 redundanten Messungen verteilt die Ausgleichung den 20mm-Fehler
    // ueber das ganze Netz: Abstaende sind um bis zu 13mm verzogen. Der Fehler
    // versteckt sich also - genau deshalb muss das Werkzeug ihn benennen.
    chk('analyze: der Ausreisser verzerrt die Form spuerbar (>5mm)', formErr(fit.pts)>5);
    // Und das ist der Arbeitsablauf, um den es geht: markierte Messung
    // stilllegen -> Form erholt sich vollstaendig, Netz bleibt bestimmt.
    const ohne=mit.map((m,i)=>i===7 ? {...m, on:false} : {...m});
    const fit2=C.solve(L.map(p=>({...p})), ohne);
    chk('analyze: nach Stilllegen stimmt die Form wieder (<0.01mm)', formErr(fit2.pts)<0.01);
    chk('analyze: nach Stilllegen ist das Netz noch bestimmt', C.analyze(fit2.pts,ohne).dof===0);
  }
  // --- Kovarianz ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const G=C.trivialModes(rect);
    const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
    chk('trivialModes: drei Stueck', G.length===3);
    chk('trivialModes: orthonormal',
       G.every(g=>near(dot(g,g),1,1e-9)) && near(dot(G[0],G[1]),0,1e-9)
       && near(dot(G[0],G[2]),0,1e-9) && near(dot(G[1],G[2]),0,1e-9));
    chk('trivialModes: liegen im Nullraum von J', (()=>{
      const J=C.jacobian(rect,[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000}]);
      return G.every(g=>J.every(r=>near(dot(r,g),0,1e-6)));
    })());
  }
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const voll=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
                {a:'D',b:'A',d:3000},{a:'A',b:'C',d:5000},{a:'B',b:'D',d:5000}];
    const cov=C.covariance(rect,voll,6);
    chk('covariance: ein Block je Punkt', cov && cov.length===4);
    chk('covariance: endlich und positiv',
       cov.every(c=>isFinite(c.xx)&&isFinite(c.yy)&&c.xx>0&&c.yy>0));
    chk('covariance: keine Punkt-Bevorzugung durch die Eichung', (()=>{
      // Symmetrisches Netz -> alle vier Ecken muessen aehnlich unsicher sein.
      // Waere an P0 gepinnt worden, waere P0 exakt 0 und der Rest wuechse.
      const sp=cov.map(c=>c.xx+c.yy);
      return Math.max(...sp)/Math.min(...sp) < 1.5;
    })());
    chk('covariance: unterbestimmt -> null',
       C.covariance(rect,[{a:'A',b:'B',d:4000}],null)===null);
    // Review-Finding 1: der unterbestimmteste Fall ueberhaupt - keine einzige
    // aktive Messung. jacobian() liefert dann 0 Zeilen; matTmat() kann die
    // Spaltenzahl nicht mehr aus den Zeilen ablesen und liefert [] statt einer
    // Nullmatrix (siehe dort). Ungeschuetzt indiziert covariance() darauf
    // undefined[j] und stuerzt ab. Mit try/catch geprueft, damit ein Absturz
    // hier als FAIL auffaellt statt den ganzen Lauf mitzureissen.
    chk('covariance: keine Messungen ueberhaupt -> null statt Absturz', (()=>{
      try{ return C.covariance(rect,[],null)===null; }catch(e){ return false; }
    })());
    chk('covariance: alle Messungen deaktiviert -> null statt Absturz', (()=>{
      try{ return C.covariance(rect,[{a:'A',b:'B',d:4000,on:false}],null)===null; }catch(e){ return false; }
    })());
    // Der mittlere Anzeigefall: bestimmt, aber redundanzfrei. Ellipsen kommen
    // dann aus dem ANGENOMMENEN sigma und werden gestrichelt gezeichnet.
    // Liefert das null, faellt Task 12 stumm in den Pfeil-Zweig.
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    const knapp=C.covariance(rect, seiten.concat([{a:'A',b:'C',d:5000}]), null);
    // Review-Finding 2: knapp.length===4 explizit mitpruefen - [].every(...) ist
    // auf [] vakuos wahr (wie bei "modes.length===1" weiter oben), der Check
    // bestuende also selbst dann, wenn covariance() faelschlich [] zurueckgaebe.
    chk('covariance: exakt bestimmt + sigmaHat null -> endliche Bloecke',
       knapp && knapp.length===4 && knapp.every(c=>isFinite(c.xx)&&isFinite(c.yy)&&c.xx>0&&c.yy>0));
    // Laenge auch hier vor dem Indizieren pruefen: knapp[1] auf einem leeren
    // Array ist undefined, und .xx darauf wirft - dann reisst dieser eine Check
    // per Exception den ganzen Lauf ab, statt einfach als FAIL durchzufallen.
    chk('covariance: B und D sind unsicherer als A und C (nur A-C gemessen)',
       knapp && knapp.length===4 && knapp[1].xx > knapp[0].xx && knapp[3].xx > knapp[2].xx);
  }
  {
    const e=C.ellipse({xx:400,xy:0,yy:100});
    chk('ellipse: Halbachsen 20 und 10', near(e.a,20,1e-9)&&near(e.b,10,1e-9));
    chk('ellipse: grosse Achse waagerecht', near(e.ang,0,1e-9));
    const e2=C.ellipse({xx:100,xy:0,yy:400});
    chk('ellipse: grosse Achse senkrecht', near(Math.abs(e2.ang),Math.PI/2,1e-9));
    // Review-Finding 3: beide Faelle oben haben xy=0 - darin verschwinden sowohl
    // das -xy*xy in der Determinante als auch das 2*xy im Winkel-Zaehler. Ein
    // fehlender Faktor 2 oder ein Vorzeichenfehler bei xy waere unbemerkt
    // geblieben. Handgerechnet: tr=500, det=250*250-150*150=40000, r=150 ->
    // a=sqrt(400)=20, b=sqrt(100)=10, ang=0.5*atan2(300,0)=pi/4.
    const e3=C.ellipse({xx:250,xy:150,yy:250});
    chk('ellipse: schiefe Kovarianz -> Halbachsen 20 und 10',
       near(e3.a,20,1e-9)&&near(e3.b,10,1e-9));
    chk('ellipse: schiefe Kovarianz -> Winkel 45 Grad', near(e3.ang,Math.PI/4,1e-9));
    // xx=yy oben ist selbst noch ein Sonderfall: atan2(y,0) haengt nur vom
    // Vorzeichen von y ab, nie von seiner Groesse - ein fehlender Faktor 2 wuerde
    // das Ergebnis dann NICHT aendern, e3 wuerde ihn also nicht fangen. Deshalb
    // zusaetzlich ein Fall mit xx!=yy, gebaut aus einer 3-4-5-Drehung (cos=4/5,
    // sin=3/5) zweier Eigenwerte 400 und 100: xx=292, xy=144, yy=208 -> a=20,
    // b=10, Winkel=atan2(3,4). Per Mutationstest geprueft: dieser Fall faengt
    // fehlenden Faktor 2, Vorzeichenfehler bei xy und det=xx*yy+xy*xy gleichermassen.
    const e4=C.ellipse({xx:292,xy:144,yy:208});
    chk('ellipse: schiefe Kovarianz mit xx!=yy -> Halbachsen 20 und 10',
       near(e4.a,20,1e-9)&&near(e4.b,10,1e-9));
    chk('ellipse: schiefe Kovarianz mit xx!=yy -> Winkel aus 3-4-5-Drehung',
       near(e4.ang,Math.atan2(3,4),1e-9));
  }
  // --- Polygon und Messbarkeit (Spec-Test 4) ---
  {
    const L=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
             {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A']];
    const poly=C.wallPolygon(L,walls);
    chk('wallPolygon: geschlossener Zug -> 6 Ecken', poly && poly.length===6);
    chk('pointInPoly: Punkt im schmalen Schenkel', poly && C.pointInPoly({x:6000,y:1000},poly));
    chk('pointInPoly: Punkt im ausgesparten Bereich', poly && !C.pointInPoly({x:6000,y:4000},poly));
    chk('wallPolygon: offener Zug -> null',
       C.wallPolygon(L,[['A','B'],['B','C'],['C','D']])===null);
    chk('wallPolygon: Knotengrad ungleich 2 -> null',
       C.wallPolygon(L,walls.concat([['A','D']]))===null);
  }
  // --- pairMeasurable: Waende sind immer messbar, echte Diagonalen bleiben
  // gefiltert (Review-Finding 3). Die beiden Haelften des Tests sind die
  // beiden Fragen, die pairMeasurable stellt: steht eine Wand im Weg (C-F),
  // und liegt die kreuzungsfreie Strecke ueberhaupt drinnen (C-E).
  {
    const L=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
             {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A']];
    const poly=C.wallPolygon(L,walls);
    walls.forEach(([a,b])=>chk(`pairMeasurable: Wand ${a}-${b} ist messbar`,
       poly && C.pairMeasurable(L,walls,poly,a,b)));
    chk('pairMeasurable: C-F quert Wand D-E -> nicht messbar',
       poly && !C.pairMeasurable(L,walls,poly,'C','F'));
    chk('pairMeasurable: C-E kreuzt keine Wand, laeuft aber aussen herum -> nicht messbar',
       poly && !C.pairMeasurable(L,walls,poly,'C','E'));
    chk('pairMeasurable: A-E bleibt messbar (Kontrolle: gueltige Diagonale)',
       poly && C.pairMeasurable(L,walls,poly,'A','E'));
    // Ohne Polygon (offener Zug) traegt der Schnitttest allein - frueher fiel
    // der Filter hier komplett aus und schlug C-F vor.
    const offen=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F']];
    chk('pairMeasurable: offener Zug -> C-F bleibt am Wandschnitt haengen',
       C.wallPolygon(L,offen)===null && !C.pairMeasurable(L,offen,null,'C','F'));
    // Der Fall aus dem Raum vom 23.8.2026: die Strecke schneidet die Wand so
    // flach, dass von 32 gleichmaessigen Stuetzpunkten keiner ausserhalb lag.
    // Der Segmentschnitt sieht ihn unabhaengig von der Abtastung.
    {
      const flach=[{id:'A',x:0,y:0},{id:'C',x:10000,y:60},
                   {id:'P',x:4000,y:-30},{id:'Q',x:4000,y:30}];
      chk('pairMeasurable: flacher, knapper Wandschnitt faellt auf (32-Stuetzpunkt-Bug)',
         !C.pairMeasurable(flach, [['P','Q']], null, 'A', 'C'));
    }
  }
  // --- Waende duerfen sich nicht kreuzen (Task 11) ---
  {
    const bow=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:0,y:3000},{id:'D',x:4000,y:3000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','A']];
    chk('ringSelfIntersects: gekreuztes Viereck erkannt',
       C.ringSelfIntersects(C.wallPolygonRaw ? C.wallPolygonRaw(bow,walls) : bow)===true);
    chk('wallPolygon: gekreuzter Zug -> null', C.wallPolygon(bow,walls)===null);
    const ok=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    chk('wallPolygon: sauberes Rechteck weiterhin gueltig',
       C.wallPolygon(ok,walls)!==null);
    chk('ringSelfIntersects: sauberes Rechteck ist frei', C.ringSelfIntersects(ok)===false);
    // L-Raum aus der Spec muss weiter durchgehen
    const L=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
             {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
    chk('ringSelfIntersects: L-Raum ist frei', C.ringSelfIntersects(L)===false);
    // Vor dem Anlegen pruefen
    const drei=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    chk('wallCrossesExisting: Diagonale kreuzt nichts, wenn nur eine Wand da ist',
       C.wallCrossesExisting(drei,[['A','B']],'C','D')===false);
    chk('wallCrossesExisting: kreuzende Wand erkannt',
       C.wallCrossesExisting(drei,[['A','C']],'B','D')===true);
    // Der Ring muss auch im gekreuzten Fall zur Inspektion verfuegbar bleiben
    // (siehe Statuszeilen-Unterscheidung "nicht geschlossen" vs "kreuzt sich") -
    // sonst kann wallPolygonRing != null pruefen, wer den kaputten Fall meldet.
    chk('wallPolygonRing: liefert den rohen Ring auch wenn er sich kreuzt',
       (()=>{ const r=C.wallPolygonRing(bow,walls); return Array.isArray(r) && r.length===4; })());
    // Benachbarte Kanten teilen sich per Konstruktion einen Endpunkt - ohne den
    // Adjazenz-Ausschluss meldete sich jedes Polygon selbst als gekreuzt.
    // Kontrollprobe hier: ein Fuenfeck mit einem ueberfluessigen, kollinearen
    // Eckpunkt auf einer Kante (B liegt exakt auf der Strecke A-C). Das ist ein
    // gueltiger, wenn auch entarteter Ring - kein echter Schnitt zweier Kanten.
    const collinear=[{id:'A',x:0,y:0},{id:'B',x:2000,y:0},{id:'C',x:4000,y:0},
                     {id:'D',x:4000,y:3000},{id:'E',x:0,y:3000}];
    chk('ringSelfIntersects: kollinearer Zwischenpunkt auf einer Kante wird nicht als Schnitt gewertet',
       C.ringSelfIntersects(collinear)===false);
  }
  // --- suggest ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','A']];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    const s=C.suggest(rect,walls,seiten);
    const best=s.filter(x=>x.why==='bestimmt');
    chk('suggest: genau ein Vorschlag fuer Bestimmtheit', best.length===1);
    chk('suggest: es ist eine Diagonale',
       best.length===1 && ['AC','BD'].includes([best[0].a,best[0].b].sort().join('')));
    chk('suggest: Vorschlag macht das Netz bestimmt', (()=>{
      if(best.length!==1) return false;
      const I=C.idx(rect);
      const d=C.dist(rect[I[best[0].a]],rect[I[best[0].b]]);
      return C.analyze(rect, seiten.concat([{a:best[0].a,b:best[0].b,d}])).dof===0;
    })());
    chk('suggest: schlaegt danach Messungen zur Pruefbarkeit vor',
       s.length>0 && s.some(x=>x.why==='pruefbar'));
  }
  {
    const L=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
             {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A']];
    const I=C.idx(L);
    const seiten=walls.map(([a,b])=>({a,b,d:C.dist(L[I[a]],L[I[b]])}));
    chk('analyze: L mit 6 Waenden -> 3 Messungen fehlen', C.analyze(L,seiten).dof===3);
    const s=C.suggest(L,walls,seiten);
    chk('suggest: genau 3 Vorschlaege fuer Bestimmtheit',
       s.filter(x=>x.why==='bestimmt').length===3);
    chk('suggest: kein Vorschlag verlaesst den Raum',
       s.length>0 && s.every(x=>C.pairMeasurable(L,walls,C.wallPolygon(L,walls),x.a,x.b)));
    chk('suggest: C-F wird nie vorgeschlagen',
       s.length>0 && !s.some(x=>[x.a,x.b].sort().join('')==='CF'));
    chk('suggest: Pruefbarkeitsphase ist gedeckelt',
       s.filter(x=>x.why==='pruefbar').length<=C.SUGGEST_CHECK_MAX);
  }
  // --- suggest: Wiederholungen ---
  {
    // Dreieck, alle drei Seiten gemessen: exakt bestimmt, nichts pruefbar, und
    // es gibt kein ungemessenes Paar mehr. Nur eine Wiederholung kann hier noch
    // Pruefbarkeit herstellen.
    const tri=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:1500,y:3000}];
    const tw=[['A','B'],['B','C'],['C','A']];
    const I=C.idx(tri);
    const tm=tw.map(([a,b])=>({a,b,d:C.dist(tri[I[a]],tri[I[b]]),sigma:C.SIGMA_DEF}));
    const a0=C.analyze(tri,tm);
    chk('suggest-Fixture: Dreieck exakt bestimmt, nichts pruefbar',
       a0.m===3 && a0.dof===0 && a0.redundancy===0 && a0.w.length===3 && a0.w.every(x=>x===null));
    const s=C.suggest(tri,tw,tm);
    chk('suggest: schlaegt trotz vollstaendig gemessener Paare etwas vor', s.length>0);
    chk('suggest: und es sind Wiederholungen', s.length>0 && s.every(x=>x.repeat===true));
    chk('suggest: Wiederholungen nur in der Pruefbarkeits-Phase',
       s.length>0 && s.every(x=>x.why==='pruefbar'));
    chk('suggest: die Wiederholung macht ihr Paar pruefbar', (()=>{
      const w=s.find(x=>x.repeat); if(!w) return false;
      const mit=tm.concat([{a:w.a,b:w.b,d:C.dist(tri[I[w.a]],tri[I[w.b]]),sigma:C.SIGMA_DEF}]);
      return C.analyze(C.solve(tri,mit).pts,mit).w.filter(x=>x!==null).length>=2;
    })());
  }
  {
    // Gegenprobe: solange ein ungemessenes Paar existiert, gewinnt es. Eine
    // Wiederholung darf die Bestimmtheit nie herstellen.
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','A']];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    const best=C.suggest(rect,walls,seiten).filter(x=>x.why==='bestimmt');
    chk('suggest: Bestimmtheit weiterhin ueber ein ungemessenes Paar',
       best.length===1 && !best[0].repeat);
  }
  // --- dragAlongModes ---
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const seiten=[{a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},{a:'D',b:'A',d:3000}];
    const pts=C.solve(rect,seiten).pts;
    const an=C.analyze(pts,seiten);
    chk('dragAlongModes: Rechteck mit 4 Seiten hat dof 1', an.dof===1 && an.modes.length===1);
    const iC=C.idx(pts)['C'];
    const moved=C.dragAlongModes(pts,an.modes,iC,120,0);
    chk('dragAlongModes: liefert gleich viele Punkte', moved && moved.length===4);
    chk('dragAlongModes: gezogener Punkt bewegt sich', moved && Math.abs(moved[iC].x-pts[iC].x)>1);
    chk('dragAlongModes: Eingabe unveraendert', Math.abs(pts[iC].x-4000)<1e-6);
    const korr=C.solve(moved,seiten).pts;
    chk('dragAlongModes: Messungen bleiben nach Korrektur erfuellt',
       C.residuals(korr,seiten).every(v=>Math.abs(v)<0.01));
    chk('dragAlongModes: der Zug ist wirksam', Math.abs(korr[iC].x-pts[iC].x)>50);
    chk('dragAlongModes: ohne Moden -> null', C.dragAlongModes(pts,[],iC,120,0)===null);
  }
  // --- vendor: lz-string und qrcode sind eingebettet und funktionieren ---
  {
    const s='Wohnzimmer äöü 4,25m — Punkt AA';
    const enc=globalThis.LZString && LZString.compressToEncodedURIComponent(s);
    chk('vendor: lz-string Roundtrip', !!enc && LZString.decompressFromEncodedURIComponent(enc)===s);
    chk('vendor: lz-string Ausgabe ist URL-sicher', !!enc && /^[A-Za-z0-9+$-]+$/.test(enc));
    chk('vendor: qrcode-generator vorhanden', (()=>{
      try{ const q=globalThis.qrcode(0,'M'); q.addData('https://example.com/#raum=abc'); q.make();
           return q.getModuleCount()>0 && typeof q.isDark(0,0)==='boolean'; }
      catch(e){ return false; }
    })());
  }
  // --- store: Raumbibliothek (DOM-frei, Storage injiziert) ---
  {
    const fakeStorage=()=>{ const m=new Map(); return {
      getItem:k=>m.has(k)?m.get(k):null,
      setItem:(k,v)=>m.set(k,String(v)),
      removeItem:k=>m.delete(k),
    };};
    const mkData=()=>({pts:[{id:'A',x:0,y:0}],walls:[],meas:[],idSeq:1});

    const st=globalThis.STORE_FACTORY && STORE_FACTORY(fakeStorage());
    chk('store: Factory vorhanden', !!st);
    if(st){
      chk('store: leere Bibliothek', st.list().length===0 && st.currentId()===null);
      const id=st.create('Wohnzimmer');
      chk('store: create liefert id und listet', typeof id==='string' && st.list().length===1);
      chk('store: create legt leeres data an', st.load(id).data.pts.length===0 && st.load(id).data.idSeq===0);
      chk('store: save merged data und area', st.save(id,{data:mkData(),area:15.12})===true
        && st.load(id).data.pts.length===1 && st.load(id).area===15.12);
      chk('store: save auf unbekannte id -> false', st.save('gibtsnicht',{area:1})===false);
      chk('store: rename', st.rename(id,'Küche')===true && st.load(id).name==='Küche');
      chk('store: list ohne data, neueste zuerst', (()=>{
        const id2=st.create('Bad');
        const l=st.list();
        return l.length===2 && l[0].id===id2 && !('data' in l[0]);
      })());
      st.setCurrent(id);
      chk('store: current', st.currentId()===id);
      st.remove(id);
      chk('store: remove entfernt und raeumt current', st.list().length===1 && st.currentId()===null);
    }
    // Migration: Alt-Schluessel wird zu "Unbenannt"
    {
      const raw=fakeStorage();
      raw.setItem('raumaufmass', JSON.stringify(mkData()));
      const st2=globalThis.STORE_FACTORY && STORE_FACTORY(raw);
      const did=st2 && st2.migrate();
      chk('store: migrate uebernimmt Alt-Schluessel', did===true && st2.list().length===1
        && st2.list()[0].name==='Unbenannt' && st2.load(st2.list()[0].id).data.pts.length===1);
      chk('store: migrate loescht Alt-Schluessel', raw.getItem('raumaufmass')===null);
      chk('store: migrate nur einmal', st2.migrate()===false);
    }
    // Kaputter rooms-Eintrag darf nicht crashen
    {
      const raw=fakeStorage();
      raw.setItem('raumaufmass.rooms','{{kaputt');
      const st3=globalThis.STORE_FACTORY && STORE_FACTORY(raw);
      chk('store: kaputtes JSON -> leere Bibliothek statt Absturz', !!st3 && st3.list().length===0);
    }
    // Quota-Fehler: setItem wirft -> save false, storageOk false. Der Fake
    // KANN lesen (ein vorbefuellter Raum), nur schreiben wirft - sonst
    // liefe save() in den unknown-id-Zweig und der Quota-Pfad in
    // writeRooms() bliebe ungeprueft (genau das war hier passiert).
    {
      const pre=JSON.stringify([{id:'x',name:'X',updated:'2026-01-01T00:00:00.000Z',
        area:null,data:{pts:[],walls:[],meas:[],idSeq:0}}]);
      const boom={getItem:k=>k==='raumaufmass.rooms'?pre:null,
                  setItem:()=>{throw new Error('QuotaExceeded');},removeItem:()=>{}};
      const st4=globalThis.STORE_FACTORY && STORE_FACTORY(boom);
      chk('store: werfender Storage -> storageOk false', !!st4 && st4.storageOk===false);
      chk('store: save bei vollem Storage -> false statt Exception', (()=>{
        try{ return !!st4 && st4.save('x',{area:1})===false; }
        catch(e){ return false; }
      })());
    }
    // --- share: Raum <-> Link-Fragment ---
    {
      const room={name:'Küche äöü', data:{pts:[{id:'AA',x:1,y:2}],walls:[['AA','AA']],meas:[],idSeq:27}};
      const enc=globalThis.encodeShare && encodeShare(room);
      chk('share: encode liefert URL-sicheren String', !!enc && /^[A-Za-z0-9+$-]+$/.test(enc));
      chk('share: Roundtrip identisch', !!enc && JSON.stringify(decodeShare(enc))===JSON.stringify(room));
      chk('share: decode von Muell -> null', globalThis.decodeShare && decodeShare('%%%nichtkomprimiert')===null);
      chk('share: decode von leer -> null', globalThis.decodeShare && decodeShare('')===null);
      chk('share: parseShareFragment happy path', (()=>{
        if(!globalThis.parseShareFragment) return false;
        const p=parseShareFragment('#raum='+enc);
        return !!p && p.name==='Küche äöü' && p.data.idSeq===27;
      })());
      chk('share: parseShareFragment ohne raum= -> null',
        globalThis.parseShareFragment && parseShareFragment('#foo=bar')===null
        && parseShareFragment('')===null && parseShareFragment('#raum=')===null);
    }
  }
  // --- store: Nachzuegler aus dem Final-Review ---
  {
    const fake=()=>{ const m=new Map(); return {
      getItem:k=>m.has(k)?m.get(k):null,
      setItem:(k,v)=>m.set(k,String(v)),
      removeItem:k=>m.delete(k),
    };};
    const st=globalThis.STORE_FACTORY && STORE_FACTORY(fake());
    chk('store: remove auf nicht-aktuelle id laesst current stehen', (()=>{
      if(!st) return false;
      const a=st.create('A'), b=st.create('B');
      st.setCurrent(a); st.remove(b);
      return st.currentId()===a && st.list().length===1;
    })());
    const raw=fake();
    raw.setItem('raumaufmass','{{kaputt');
    const st2=globalThis.STORE_FACTORY && STORE_FACTORY(raw);
    chk('store: korrupter Alt-Schluessel -> migrate false, Schluessel weg, kein Raum',
      !!st2 && st2.migrate()===false && raw.getItem('raumaufmass')===null && st2.list().length===0);
  }
  // --- Gebaeude: origin und die Abbildung zwischen zwei Raumsystemen ---
  {
    const rt=globalThis.roomTransform, ap=globalThis.applyRoomTransform;
    chk('gebaeude: Transformationen vorhanden', typeof rt==='function' && typeof ap==='function');
    if(rt && ap){
      const o={x:1234,y:-567,rot:0.7};
      const T0=rt(o,o), p={id:'A',x:300,y:900};
      const q0=ap(T0,p);
      chk('roomTransform: gleiches System -> Identitaet',
        near(T0.rot,0,1e-12) && near(q0.x,p.x,1e-9) && near(q0.y,p.y,1e-9));
      const a={x:0,y:0,rot:0}, b={x:5000,y:2000,rot:Math.PI/2};
      const inA=ap(rt(b,a), p);
      // Raum B liegt um 90 Grad gedreht bei (5000,2000): (300,900) wird zu
      // (5000-900, 2000+300).
      chk('roomTransform: 90 Grad + Versatz von Hand nachgerechnet',
        near(inA.x,4100,1e-6) && near(inA.y,2300,1e-6));
      const back=ap(rt(a,b), inA);
      chk('roomTransform: hin und zurueck trifft denselben Punkt',
        near(back.x,p.x,1e-6) && near(back.y,p.y,1e-6));
      chk('roomTransform: id bleibt erhalten', back.id==='A');
    }
    const fake=()=>{ const m=new Map(); return {
      getItem:k=>m.has(k)?m.get(k):null,
      setItem:(k,v)=>m.set(k,String(v)),
      removeItem:k=>m.delete(k),
    };};
    const st=globalThis.STORE_FACTORY && STORE_FACTORY(fake());
    if(st){
      const a=st.create('Küche'), b=st.create('Flur');
      chk('store: ohne origin ist die Bibliothek kein Gebaeude', st.withOrigin().length===0);
      st.save(a,{origin:{x:0,y:0,rot:0}});
      chk('store: origin ueberlebt save', !!st.load(a).origin && st.load(a).origin.x===0);
      chk('store: withOrigin liefert nur verankerte Raeume, mit Daten',
        st.withOrigin().length===1 && st.withOrigin()[0].id===a && !!st.withOrigin()[0].data);
      st.save(a,{area:12.5});
      chk('store: spaeteres save ohne origin loescht die Verankerung nicht', !!st.load(a).origin);
      chk('store: freistehender Raum bleibt freistehend', !st.load(b).origin);
    }
  }
  // --- Nachbarraum hinter einer Tuer: Verankerung der geerbten Wand ---
  {
    const no=globalThis.neighborOrigin, rt=globalThis.roomTransform,
          ap=globalThis.applyRoomTransform;
    chk('nachbar: neighborOrigin vorhanden', typeof no==='function');
    if(no && rt && ap){
      // Quadrat gegen den Uhrzeigersinn; Wand A-B ist die untere Kante.
      const pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},
                 {id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
      const walls=[['A','B'],['B','C'],['C','D'],['D','A']];
      const oR={x:0,y:0,rot:0};
      const r=no(pts, walls, 'A', 'B', 240, oR);
      chk('nachbar: Wandlaenge uebernommen', !!r && near(r.L,4000,1e-9));
      if(r){
        const T=rt(r.origin, oR);
        const p0=ap(T,{x:0,y:0}), p1=ap(T,{x:r.L,y:0});
        // Beide Punkte muessen auf der um 240 nach AUSSEN versetzten
        // Parallelen liegen - also bei y=-240, weil der Raum oberhalb liegt.
        chk('nachbar: (0,0) landet auf der versetzten Wand',
          near(p0.y,-240,1e-6) && (near(p0.x,0,1e-6)||near(p0.x,4000,1e-6)));
        chk('nachbar: (L,0) landet am anderen Ende derselben Wand',
          near(p1.y,-240,1e-6) && near(Math.abs(p1.x-p0.x),4000,1e-6));
        // Der Quellraum liegt in SEINEM System unter der geerbten Wand.
        const mitteQuelle=ap(rt(oR, r.origin), {x:2000,y:1500});
        chk('nachbar: Quellraum liegt unter der geerbten Wand', mitteQuelle.y<0);
        chk('nachbar: geerbte Ecken benannt',
          (r.vonEcke==='A'||r.vonEcke==='B') && r.vonEcke!==r.bisEcke);
      }
      // Gegenprobe mit der gegenueberliegenden Wand: dort zeigt die
      // Aussennormale in die andere Richtung, die Laufrichtung dreht sich.
      const r2=no(pts, walls, 'C', 'D', 300, oR);
      if(r2){
        const T2=rt(r2.origin, oR);
        const q0=ap(T2,{x:0,y:0});
        chk('nachbar: Gegenwand versetzt nach der anderen Seite',
          near(q0.y,3300,1e-6));
        chk('nachbar: Quellraum auch dort unter der Wand',
          ap(rt(oR,r2.origin),{x:2000,y:1500}).y<0);
      }
      chk('nachbar: unbrauchbare Eingaben -> null',
        no(pts,walls,'A','B',0,oR)===null && no(pts,walls,'A','X',240,oR)===null);
      // Gedrehter Quellraum: die Verankerung muss die Drehung mittragen.
      const oR2={x:1000,y:-500,rot:0.9};
      const r3=no(pts, walls, 'A', 'B', 240, oR2);
      if(r3){
        // Im GEBAEUDE muss der Ursprung des Nachbarn genau auf der um 240
        // versetzten Ecke des Quellraums liegen - unabhaengig davon, wie
        // der Quellraum selbst im Gebaeude steht.
        const welt=o=>ap({rot:o.rot, x:o.x, y:o.y}, {x:0,y:0});
        const g=welt(r3.origin);
        // Die Wand laeuft im neuen Raum von B nach A (sonst laege der
        // Quellraum ueber ihr), sein Ursprung ist also die versetzte
        // Ecke B: (4000, -240) im System des Quellraums.
        const versetzt=ap({rot:oR2.rot, x:oR2.x, y:oR2.y}, {x:4000,y:-240});
        chk('nachbar: gedrehter Quellraum -> versetzte Ecke im Gebaeude',
          near(g.x,versetzt.x,1e-6) && near(g.y,versetzt.y,1e-6));
        chk('nachbar: Drehung des Quellraums schlaegt durch',
          near(r3.origin.rot-r.origin.rot, oR2.rot, 1e-9));
      }
    }
  }
  // --- der frisch angelegte Nachbarraum rechnet sich ohne Absturz ---
  {
    const pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0}];
    const meas=[{a:'A',b:'B',d:4000}];
    const fit=C.solve(pts, meas);
    const an=C.analyze(fit.pts, meas);
    chk('nachbar: zwei Punkte, eine Messung -> loesbar',
      !!fit && fit.pts.every(p=>isFinite(p.x)&&isFinite(p.y)));
    chk('nachbar: Laenge bleibt erhalten', near(C.dist(fit.pts[0],fit.pts[1]),4000,1e-6));
    chk('nachbar: Analyse ohne Redundanz, aber ohne Absturz',
      !!an && an.redundancy===0);
  }
  // --- Wandkoerper: Innenkontur + Dicke nach aussen, Ecken per Gehrung ---
  {
    const wb=globalThis.wallBands;
    chk('band: wallBands vorhanden', typeof wb==='function');
    if(wb){
      const rechteck=(w,h)=>({
        pts:[{id:'A',x:0,y:0},{id:'B',x:w,y:0},{id:'C',x:w,y:h},{id:'D',x:0,y:h}],
        walls:[['A','B'],['B','C'],['C','D'],['D','A']]});
      const r=rechteck(4000,3000);
      const b=wb(r.pts, r.walls, {}, 240);
      chk('band: je Wand ein Koerper', b.length===4);
      chk('band: ohne Eintrag gilt der angenommene Wert',
        b.every(x=>x.t===240 && x.assumed===true));
      // Aussenecken eines Rechtecks: genau die um 240 nach aussen
      // versetzten Ecken - also (-240,-240) bis (4240,3240).
      const alle=b.flatMap(x=>[x.oA,x.oB]);
      chk('band: Aussenkontur ist das um 240 vergroesserte Rechteck',
        alle.every(p=>near(Math.min(Math.abs(p.x+240),Math.abs(p.x-4240)),0,1e-6)
                   && near(Math.min(Math.abs(p.y+240),Math.abs(p.y-3240)),0,1e-6)));
      // Die entscheidende Eigenschaft: benachbarte Vierecke teilen die Ecke.
      const teiltEcken=bs=>bs.every(x=>{
        const nach=bs.find(y=>y.a===x.b);
        return nach && near(x.oB.x,nach.oA.x,1e-9) && near(x.oB.y,nach.oA.y,1e-9);
      });
      chk('band: Nachbarwaende teilen ihre Aussenecke', teiltEcken(b));
      // Flaeche der vier Vierecke = Umfang*t + 4*t^2 (jede Ecke einmal)
      const flaeche=q=>{
        const P=[q.iA,q.iB,q.oB,q.oA]; let a=0;
        for(let i=0,j=3;i<4;j=i++) a+=P[j].x*P[i].y-P[i].x*P[j].y;
        return Math.abs(a)/2;
      };
      chk('band: Gesamtflaeche = Umfang*t + 4*t²',
        near(b.reduce((s,q)=>s+flaeche(q),0), 14000*240+4*240*240, 1e-6));
      // Unterschiedliche Dicken je Wand: die Gehrung muss beide tragen.
      const b2=wb(r.pts, r.walls, {'A|B':300}, 240);
      chk('band: eingetragene Dicke schlaegt den angenommenen Wert',
        b2.some(x=>x.t===300 && x.assumed===false) && b2.some(x=>x.assumed===true));
      chk('band: gemischte Dicken teilen die Ecke trotzdem', teiltEcken(b2));
      // Sehr spitze Ecke: der Ersatzpunkt muss fuer BEIDE Waende gelten,
      // sonst klafft genau dort die Wand auf.
      const spitz={pts:[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:3800,y:200}],
                   walls:[['A','B'],['B','C'],['C','A']]};
      const b3=wb(spitz.pts, spitz.walls, {}, 240);
      chk('band: spitze Ecke reisst nicht auf', b3.length===3 && teiltEcken(b3));
      chk('band: spitze Ecke bleibt in der Naehe der Ecke',
        b3.every(x=>C.dist(x.oA,x.iA)<6*240+1 && C.dist(x.oB,x.iB)<6*240+1));
      chk('band: offener Wandzug -> nichts zu zeichnen',
        wb(r.pts, [['A','B'],['B','C']], {}, 240).length===0);
    }
  }
  // --- geteilte Wand: passen die beiden Raeume noch zusammen? ---
  {
    const sf=globalThis.sharedWallFit;
    chk('geteilt: sharedWallFit vorhanden', typeof sf==='function');
    if(sf){
      // Unsere Wand laeuft von (0,0) nach (4000,0), der Raum liegt oberhalb.
      // Die Wand des Nachbarn liegt 240 darunter und laeuft ANDERSHERUM.
      const a1={x:0,y:0}, b1={x:4000,y:0};
      const r=sf(a1,b1, {x:4000,y:-240}, {x:0,y:-240});
      chk('geteilt: Dicke ist der Lotabstand', !!r && near(r.dicke,240,1e-9));
      chk('geteilt: parallele Waende -> 0 Grad', near(r.winkel,0,1e-9));
      chk('geteilt: gleiche Laenge -> kein Unterschied, kein Versatz',
        near(r.laengeD,0,1e-9) && near(r.versatz,0,1e-9));
      chk('geteilt: volle Ueberlappung', near(r.ueberlappung,4000,1e-9));
      // Gegenprobe mit GLEICHER Laufrichtung: dasselbe Ergebnis, die
      // Richtungsangleichung darf nichts verfaelschen.
      const r2=sf(a1,b1, {x:0,y:-240}, {x:4000,y:-240});
      chk('geteilt: Laufrichtung des Nachbarn ist egal',
        near(r2.dicke,240,1e-9) && near(r2.winkel,0,1e-9) && near(r2.versatz,0,1e-9));
      // 20mm laenger, an EINEM Ende ueberstehend
      const r3=sf(a1,b1, {x:4020,y:-240}, {x:0,y:-240});
      chk('geteilt: laengere Nachbarwand wird als Differenz gemeldet',
        near(r3.laengeD,20,1e-9) && near(r3.versatz,20,1e-9));
      // Verschoben, aber gleich lang: reiner Versatz ohne Laengenunterschied
      const r4=sf(a1,b1, {x:4030,y:-240}, {x:30,y:-240});
      chk('geteilt: reiner Versatz ohne Laengenunterschied',
        near(r4.laengeD,0,1e-9) && near(r4.versatz,30,1e-9));
      // Schiefstellung: 1 Grad verdreht
      const w=1*Math.PI/180;
      const r5=sf(a1,b1, {x:4000*Math.cos(w), y:-240+4000*Math.sin(w)}, {x:0,y:-240});
      chk('geteilt: Schiefstellung wird in Grad gemeldet', near(r5.winkel,1,1e-6));
      chk('geteilt: entartete Eingaben -> null',
        sf(a1,a1,{x:0,y:-240},{x:4000,y:-240})===null);
      // Dickenaenderung schlaegt direkt durch - das ist die abgeleitete Dicke
      chk('geteilt: 175 statt 240 liest sich als 175',
        near(sf(a1,b1,{x:4000,y:-175},{x:0,y:-175}).dicke,175,1e-9));
    }
  }
  // --- Der Ring: Weg im Baum und Schlussfehler ---
  {
    const rp=globalThis.ringPfad, sfz=globalThis.schlussFehler;
    chk('ring: ringPfad vorhanden', typeof rp==='function' && typeof sfz==='function');
    if(rp){
      // Baum a-b-c-d, Schlusskante spaeter zwischen a und d
      const k=[{von:'a',zu:'b'},{von:'b',zu:'c'},{von:'c',zu:'d'}];
      chk('ring: Weg durch den ganzen Baum',
        JSON.stringify(rp(k,'a','d'))===JSON.stringify(['a','b','c','d']));
      chk('ring: Weg rueckwaerts ist derselbe, nur umgedreht',
        JSON.stringify(rp(k,'d','a'))===JSON.stringify(['d','c','b','a']));
      chk('ring: Weg zu sich selbst', JSON.stringify(rp(k,'b','b'))===JSON.stringify(['b']));
      chk('ring: kein Weg -> null', rp(k,'a','x')===null);
      chk('ring: Abzweig wird nicht mitgeschleppt',
        JSON.stringify(rp(k.concat([{von:'b',zu:'z'}]),'a','c'))===JSON.stringify(['a','b','c']));
    }
    if(sfz){
      // Zwei Raeume, kuenstlich als Schlusskante gefuehrt: der zweite liegt
      // 40mm zu weit weg und 1 Grad schief.
      const rechteckR=(w,h)=>({
        pts:[{id:'A',x:0,y:0},{id:'B',x:w,y:0},{id:'C',x:w,y:h},{id:'D',x:0,y:h}],
        walls:[['A','B'],['B','C'],['C','D'],['D','A']],
        meas:[{a:'A',b:'B',d:w}], openings:[], thick:{}, shared:{}});
      const A={id:'a', data:rechteckR(4000,3000)};
      const B={id:'b', data:rechteckR(4000,2000)};
      A.data.thick={'A|B':240};
      const kante=[{a:'a', b:'b', wand:'A|B', gegenwand:'A|B'}];
      // Reiner Abstandsfehler: 280 statt der eingetragenen 240
      const b0={ origins:{a:{x:0,y:0,rot:0}, b:{x:4000,y:-280,rot:Math.PI}},
                 kanten:[], schluss:kante };
      const r=sfz([A,B], b0);
      chk('ring: Schlussfehler wird gerechnet', r.length===1);
      chk('ring: Klaffen gegen die Solldicke',
        near(r[0].dicke,280,1e-6) && near(r[0].soll,240,1e-9)
        && near(r[0].klaffen,40,1e-6) && near(r[0].winkel,0,1e-9));
      // Schiefstand: 1 Grad verdreht. Der Abstand waechst dabei zwangslaeufig
      // mit, weil das ferne Wandende wegschwenkt - gemeldet wird der Mittelwert.
      const w=1*Math.PI/180;
      const r2=sfz([A,B], {origins:{a:{x:0,y:0,rot:0}, b:{x:4000,y:-280,rot:Math.PI+w}},
                           kanten:[], schluss:kante});
      chk('ring: Schiefstand in Grad', near(r2[0].winkel,1,1e-6));
      chk('ring: Schiefstand zieht den gemeldeten Abstand mit',
        near(r2[0].dicke, 280+4000*Math.sin(w)/2, 1e-3));
      chk('ring: ohne Baumkanten bleibt der Ring die Schlusskante selbst',
        JSON.stringify(r[0].ring)===JSON.stringify(['a','b']));
      chk('ring: keine Schlusskante -> nichts zu melden',
        sfz([A,B], {origins:b0.origins, kanten:[], schluss:[]}).length===0);
    }
  }
  // --- Zwei Waende als eine erklaeren: welche kommen in Frage? ---
  {
    const wk=globalThis.wandKandidaten;
    chk('nahwand: wandKandidaten vorhanden', typeof wk==='function');
    if(wk){
      const w=(a,b,x0,y0,x1,y1,nx,ny)=>({a,b,iA:{x:x0,y:y0},iB:{x:x1,y:y1},n:{x:nx,y:ny}});
      // Raum A: Rechteck 4000x3000, untere Wand auf y=0, aussen nach unten.
      const A=[w('A','B', 0,0, 4000,0, 0,-1),
               w('C','D', 4000,3000, 0,3000, 0,1)];
      // Raum B liegt darunter, seine Innenkante auf y=-240, aussen nach oben.
      const B=[w('A','B', 4000,-240, 0,-240, 0,1)];
      const r=wk(A,B);
      chk('nahwand: gegenueberliegende Waende werden gefunden',
        r.length===1 && r[0].a==='A' && r[0].b==='B' && near(r[0].dicke,240,1e-9));
      chk('nahwand: die abgewandte Wand desselben Raums zaehlt nicht',
        !r.some(x=>x.a==='C'));
      chk('nahwand: zu weit weg ist keine Wand',
        wk(A,[w('A','B', 4000,-1500, 0,-1500, 0,1)]).length===0);
      chk('nahwand: zu nah ist auch keine Wand',
        wk(A,[w('A','B', 4000,-20, 0,-20, 0,1)]).length===0);
      // 10 Grad Schiefstand: das sind zwei Waende, nicht eine
      const s=10*Math.PI/180;
      chk('nahwand: deutlicher Schiefstand faellt weg',
        wk(A,[w('A','B', 4000,-240, 0,-240-4000*Math.sin(s),
                Math.sin(s),Math.cos(s))]).length===0);
      chk('nahwand: ein Zipfel Ueberlappung genuegt nicht',
        wk(A,[w('A','B', 200,-240, 0,-240, 0,1)]).length===0);
      // Gleiche Lage, aber INNERHALB von Raum A - eine Wand kann nicht im
      // eigenen Raum liegen.
      chk('nahwand: eine Wand im eigenen Raum zaehlt nicht',
        wk(A,[w('A','B', 4000,240, 0,240, 0,1)]).length===0);
      // Nicht zugewandt: beide Normalen zeigen in dieselbe Richtung
      chk('nahwand: gleichgerichtete Normalen zaehlen nicht',
        wk(A,[w('A','B', 0,-240, 4000,-240, 0,-1)]).length===0);
      chk('nahwand: das plausibelste steht vorn', (()=>{
        const B2=[w('A','B', 4000,-240, 0,-240, 0,1),
                  w('X','Y', 2000,-240, 0,-240, 0,1)];
        const rr=wk(A,B2);
        return rr.length===2 && rr[0].fa==='A';
      })());
    }
  }
  // --- Messen durch die Tuer: welche Eckenpaare sieht man? ---
  {
    const sl=globalThis.sichtLinien;
    chk('durchblick: sichtLinien vorhanden', typeof sl==='function');
    if(sl){
      // Wand auf y=0, Raum 1 darueber, Raum 2 ab y=-240. Tuer 1500..2485.
      const l1={P:{x:1500,y:0},   Q:{x:2485,y:0}};
      const l2={P:{x:1500,y:-240},Q:{x:2485,y:-240}};
      const A=[{id:'A',x:2000,y:3000}, {id:'B',x:0,y:3000}];
      const B=[{id:'X',x:2000,y:-3000}, {id:'Y',x:8000,y:-3000}];
      const r=sl(A,B,[l1,l2],[]);
      chk('durchblick: gerade durch die Tuer wird gefunden',
        r.some(x=>x.a==='A'&&x.b==='X'));
      chk('durchblick: was neben der Tuer vorbeigeht, faellt weg',
        !r.some(x=>x.a==='B'&&x.b==='X'));
      // Streifschuss: die Linie trifft die Luecke bei 1510 - innerhalb der
      // rohen Oeffnung, aber im Randstreifen. Mit dem Laser nicht zu treffen.
      // Streifschuss: senkrecht bei x=1510, also 10mm hinter der Zarge -
      // geometrisch durch beide Ebenen, mit dem Laser nicht zu treffen.
      const zarge=[{id:'A',x:1510,y:3000}], zarge2=[{id:'S',x:1510,y:-3000}];
      chk('durchblick: Streifschuss an der Zarge zaehlt nicht',
        sl(zarge, zarge2, [l1,l2], []).length===0);
      // Dieselbe Linie ohne Rand waere "durch" - der Rand ist der Unterschied
      chk('durchblick: ohne Rand waere es geometrisch durch',
        sl(zarge, zarge2, [l1,l2], [], 0).length===1);
      // Eine Wand im Weg blockiert
      const sperre=[[{x:-9000,y:1000},{x:9000,y:1000}]];
      chk('durchblick: eine Wand im Weg blockiert',
        sl(A,B,[l1,l2],sperre).length===0);
      chk('durchblick: nur EINE Ebene getroffen reicht nicht',
        sl([{id:'A',x:2000,y:3000}],[{id:'X',x:2000,y:-100}],[l1,l2],[]).length===0);
      chk('durchblick: kuerzeste Strecke steht vorn',
        sl(A,[{id:'X',x:2000,y:-3000},{id:'Z',x:2000,y:-500}],[l1,l2],[])[0].b==='Z');
    }
  }
  // --- Lage aus Querstrecken: zwei Unbekannte, t und d ---
  {
    const fq=globalThis.fitQuerlage;
    chk('quer: fitQuerlage vorhanden', typeof fq==='function');
    if(fq){
      const u={x:1,y:0}, n={x:0,y:-1}, t0=300, tWahr=240, dWahr=150;
      const paare=[[{x:2000,y:3000},{x:2000,y:-3000}],
                   [{x:0,y:3000},   {x:3000,y:-3000}],
                   [{x:4000,y:3000},{x:500,y:-3000}]];
      const mach=(t,d)=>paare.map(([P,Q0])=>{
        const q={x:Q0.x+n.x*(t-t0)+u.x*d, y:Q0.y+n.y*(t-t0)+u.y*d};
        return {P, Q0, d:Math.hypot(q.x-P.x, q.y-P.y)};
      });
      const r=fq(mach(tWahr,dWahr), u, n, t0);
      chk('quer: drei Strecken finden Dicke und Versatz zurueck',
        !!r && near(r.t,tWahr,1e-6) && near(r.d,dWahr,1e-6));
      chk('quer: Residuen verschwinden bei widerspruchsfreien Werten',
        r.v.every(x=>Math.abs(x)<1e-6) && r.n===3 && r.beides===true);
      const r2=fq(mach(tWahr,0).slice(0,2), u, n, t0);
      chk('quer: zwei Strecken genuegen', !!r2 && near(r2.t,tWahr,1e-6) && near(r2.d,0,1e-6));
      // Eine einzige Strecke kann nicht beides: die Tuer bleibt Laengsanker,
      // nur die Dicke wird gerechnet.
      const r3=fq(mach(tWahr,0).slice(0,1), u, n, t0);
      chk('quer: eine Strecke bestimmt nur die Dicke',
        !!r3 && near(r3.t,tWahr,1e-6) && r3.d===0 && r3.beides===false);
      chk('quer: ohne Strecken kein Ergebnis', fq([], u, n, t0)===null);
      // Widerspruch: eine Strecke 40mm zu lang -> Rest bleibt sichtbar
      const o=mach(tWahr,dWahr); o[0].d+=40;
      const r4=fq(o, u, n, t0);
      chk('quer: Widerspruch bleibt als Residuum stehen',
        !!r4 && r4.v.some(x=>Math.abs(x)>5));
    }
  }
  // --- Lage aus den Verbindungen ableiten, Tuer als Anker ---
  {
    const bo=globalThis.buildingOrigins, ak=globalThis.ankopplung,
          rt=globalThis.roomTransform, ap=globalThis.applyRoomTransform,
          sf=globalThis.sharedWallFit;
    chk('kette: buildingOrigins vorhanden', typeof bo==='function' && typeof ak==='function');
    const rechteck=(w,h)=>({
      pts:[{id:'A',x:0,y:0},{id:'B',x:w,y:0},{id:'C',x:w,y:h},{id:'D',x:0,y:h}],
      walls:[['A','B'],['B','C'],['C','D'],['D','A']],
      meas:[{a:'A',b:'B',d:w}], openings:[], thick:{}, shared:{}});
    const tuer=(id,a,b,x,w)=>({id, kind:'door', a, b, x, y:0, w, h:1985,
                               swing:{type:'turn',hinge:'left',out:false}});
    if(bo && ak){
      // Elternraum 4000x3000, Kind 4000x2000, geteilt ueber A|B, 240 dick
      const P={id:'p', origin:{x:0,y:0,rot:0}, data:rechteck(4000,3000)};
      const K={id:'k', data:rechteck(4000,2000)};
      P.data.thick={'A|B':240};
      P.data.shared={'A|B':{room:'k', wall:['A','B']}};
      K.data.thick={'A|B':240};
      K.data.shared={'A|B':{room:'p', wall:['A','B']}};
      const r=bo([P,K]);
      chk('kette: beide Raeume bekommen eine Lage',
        !!r.origins['p'] && !!r.origins['k'] && r.wurzeln.length===1 && r.wurzeln[0]==='p');
      chk('kette: eine Baumkante, kein Ring', r.kanten.length===1 && r.schluss.length===0);
      // Die geerbte Wand muss danach genau 240 von der Elternwand entfernt
      // und parallel dazu liegen - unabhaengig von allen Winkelvorzeichen.
      const T=rt(r.origins['k'], r.origins['p']);
      const kA=ap(T,K.data.pts[0]), kB=ap(T,K.data.pts[1]);
      const fit=sf(P.data.pts[0], P.data.pts[1], kA, kB);
      chk('kette: geerbte Wand liegt 240 entfernt', !!fit && near(fit.dicke,240,1e-6));
      chk('kette: geerbte Wand ist parallel', near(fit.winkel,0,1e-9));
      chk('kette: ohne Tuer bleibt die Ecke der Anker', near(fit.versatz,0,1e-6));
      // Dieselbe Lage, die das Anlegen erzeugt - Altbestand darf nicht wandern
      const alt=globalThis.neighborOrigin(P.data.pts, P.data.walls, 'A','B', 240, P.origin);
      const p0=ap(rt(alt.origin, r.origins['p']), {x:0,y:0});
      const p1=ap(T, {x:0,y:0});
      chk('kette: deckt sich mit der Lage aus dem Anlegen',
        near(p0.x,p1.x,1e-6) && near(p0.y,p1.y,1e-6));

      // Jetzt mit Tuer: im Elternraum bei 1500..2485, im Kind gespiegelt.
      P.data.openings=[tuer('t1','A','B',1500,985)];
      P.data.shared['A|B'].tuer={op:'t1'};
      const xp=1500+985/2;
      K.data.openings=[tuer('t2','A','B', 4000-(xp+985/2), 985)];
      K.data.shared['A|B'].tuer={op:'t2'};
      const r2=bo([P,K]);
      const T2=rt(r2.origins['k'], r2.origins['p']);
      const q0=ap(T2,{x:0,y:0});
      chk('kette: gespiegelte Tuer ergibt dieselbe Lage wie die Ecke',
        near(q0.x,p1.x,1e-6) && near(q0.y,p1.y,1e-6));
      chk('kette: Verankerung ueber die Tuer wird gemeldet', r2.kanten[0].verankert===true);
      // Tuer im Kind 100 weiter von seiner Ecke A weg -> der Raum rueckt
      // um 100 laengs der Wand, die TUER bleibt liegen.
      K.data.openings=[tuer('t2','A','B', 4000-(xp+985/2)+100, 985)];
      const r3=bo([P,K]);
      const q1=ap(rt(r3.origins['k'], r3.origins['p']),{x:0,y:0});
      chk('kette: verschobene Tuermessung rueckt den Raum laengs der Wand',
        near(q1.x-q0.x,100,1e-6) && near(q1.y,q0.y,1e-9));

      // Dickenaenderung wandert automatisch mit - kein Nachschieben noetig
      P.data.thick={'A|B':300}; K.data.thick={'A|B':300};
      const r4=bo([P,K]);
      const T4=rt(r4.origins['k'], r4.origins['p']);
      const f4=sf(P.data.pts[0],P.data.pts[1], ap(T4,K.data.pts[0]), ap(T4,K.data.pts[1]));
      chk('kette: andere Dicke -> der Raum liegt von selbst richtig',
        near(f4.dicke,300,1e-6));
    }
    // Der frisch angelegte Nachbar ist nur eine WAND - kein Polygon, keine
    // Innenseite. Genau dort lag der 15mm-Versatz.
    if(bo){
      const P={id:'p', origin:{x:0,y:0,rot:0}, data:rechteck(4000,3000)};
      P.data.thick={'A|B':240};
      P.data.openings=[tuer('t1','A','B',1500,985)];
      P.data.shared={'A|B':{room:'k', wall:['A','B'], tuer:{op:'t1'}}};
      const K={id:'k', data:{
        pts:[{id:'A',x:0,y:0},{id:'B',x:4000,y:0}], walls:[['A','B']],
        meas:[{a:'A',b:'B',d:4000}], thick:{'A|B':240},
        openings:[tuer('t2','A','B',1515,985)],
        shared:{'A|B':{room:'p', wall:['A','B'], tuer:{op:'t2'}}}}};
      const r=bo([P,K]);
      const T=rt(r.origins['k'], r.origins['p']);
      const kA=ap(T,K.data.pts[0]), kB=ap(T,K.data.pts[1]);
      const f=sf(P.data.pts[0], P.data.pts[1], kA, kB);
      chk('kette: Nachbar aus nur einer Wand liegt 240 entfernt',
        !!f && near(f.dicke,240,1e-6));
      chk('kette: Nachbar aus nur einer Wand liegt parallel und buendig',
        near(f.winkel,0,1e-9) && near(f.versatz,0,1e-6));
    }
    // Ring: drei Raeume, jeder mit beiden anderen verbunden. Die Ableitung
    // folgt dem Baum, die dritte Verbindung ist die Schlusskante.
    if(bo){
      const mk=(id,w,h)=>({id, data:rechteck(w,h)});
      const A=mk('a',4000,3000), B=mk('b',4000,2000), Cc=mk('c',3000,2000);
      A.origin={x:0,y:0,rot:0};
      A.data.shared={'A|B':{room:'b',wall:['A','B']}, 'B|C':{room:'c',wall:['A','B']}};
      B.data.shared={'A|B':{room:'a',wall:['A','B']}, 'B|C':{room:'c',wall:['B','C']}};
      Cc.data.shared={'A|B':{room:'a',wall:['B','C']}, 'B|C':{room:'b',wall:['B','C']}};
      const r=bo([A,B,Cc]);
      chk('ring: alle drei Raeume liegen', Object.keys(r.origins).length===3);
      chk('ring: zwei Baumkanten, eine Schlusskante',
        r.kanten.length===2 && r.schluss.length===1);
      chk('ring: die Ableitung haengt nicht', true);
    }
    // Freistehende Raeume bleiben aussen vor
    if(bo){
      const frei={id:'f', data:rechteck(2000,2000)};
      const r=bo([frei]);
      chk('kette: Raum ohne Verbindung und ohne Verankerung bleibt draussen',
        Object.keys(r.origins).length===0);
    }
  }
  // --- computeSuspects: eine Quelle fuer Tabelle UND Plan-Markierung ---
  {
    const cs=globalThis.computeSuspects;
    chk('suspects: Funktion vorhanden', typeof cs==='function');
    if(cs){
      chk('suspects: leer/kein w -> leere Menge',
        cs([],3.29,0.02).size===0 && cs(null,3.29,0.02).size===0);
      chk('suspects: alle unpruefbar (null) -> leere Menge',
        cs([null,null],3.29,0.02).size===0);
      chk('suspects: unter Schwelle -> leere Menge',
        cs([1.2,3.28,0.4],3.29,0.02).size===0);
      chk('suspects: klarer Spitzenreiter -> genau er',
        (()=>{ const s=cs([1.0,14.05,2.2,null],3.29,0.02);
               return s.size===1 && s.has(1); })());
      chk('suspects: Gleichstand innerhalb Toleranz -> beide',
        (()=>{ const s=cs([7.20,7.15,1.0],3.29,0.02);
               return s.size===2 && s.has(0) && s.has(1); })());
      chk('suspects: knapp ausserhalb Toleranz -> nur Maximum',
        (()=>{ const s=cs([7.20,6.90,1.0],3.29,0.02);
               return s.size===1 && s.has(0); })());
      chk('suspects: ueber Schwelle noetig, Naehe zum Maximum reicht nicht',
        (()=>{ const s=cs([3.30,3.25],3.29,0.02);
               return s.size===1 && s.has(0); })());
    }
  }
  // --- Redundanz-1-Blindheit und Eingrenzung (Nutzerfall vom 2026-07-31):
  // 3x4-Rechteck, beide 5er-Diagonalen, C-D absichtlich 3,05 statt 3,00.
  // Mit nur EINEM redundanten Freiheitsgrad sind alle w identisch - der
  // w-Test KANN den Schuldigen nicht nennen. narrowCandidates liefert dann
  // die Wiederholungs-Kandidaten, groesstes Residuum zuerst.
  {
    const rect=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
    const meas=[
      {a:'A',b:'B',d:4000},{a:'B',b:'C',d:3000},{a:'C',b:'D',d:4000},
      {a:'D',b:'A',d:3050},                       // <- die eine falsche Kante
      {a:'A',b:'C',d:5000},{a:'B',b:'D',d:5000},
    ].map(m=>({...m,sigma:5}));
    const fit=C.solve(rect.map(p=>({...p})), meas);
    const an=C.analyze(fit.pts, meas);
    chk('r1-fall: Redundanz ist 1', an.redundancy===1);
    chk('r1-fall: alle w vorhanden', an.w.length===6 && an.w.every(x=>x!=null));
    chk('r1-fall: alle w identisch (Spread < 1e-3) - Isolation unmoeglich',
      (()=>{ const ws=an.w; const mx=Math.max(...ws), mn=Math.min(...ws);
             return mx-mn < 1e-3; })());
    chk('r1-fall: narrowCandidates dedupliziert, gedeckelt, groesstes |v| zuerst',
      (()=>{ const n=globalThis.narrowCandidates(meas, an.v, 3);
             if(n.length!==3) return false;
             const I=C.idx(fit.pts);
             const avOf=c=>{ const i=meas.findIndex(m=>[m.a,m.b].sort().join('|')===[c.a,c.b].sort().join('|'));
                             return Math.abs(an.v[i]); };
             return avOf(n[0])>=avOf(n[1]) && avOf(n[1])>=avOf(n[2]); })());
    chk('r1-fall: mit einer Wiederholung isoliert der w-Test den Fehler',
      (()=>{ const mit=meas.concat([{a:'D',b:'A',d:3000,sigma:5}]);
             const fit2=C.solve(rect.map(p=>({...p})), mit);
             const an2=C.analyze(fit2.pts, mit);
             const sus=globalThis.computeSuspects(an2.w, 3.29, 0.02);
             return sus.size===1 && sus.has(3); })());
    const sig5=meas.map(()=>5);
    chk('globaltest: r1-Fall schlaegt an', globalThis.globalTestFails(an.v, sig5, an.redundancy)===true);
    chk('globaltest: sauberes Netz schlaegt nicht an',
      (()=>{ const sauber=meas.map(m=>({...m, d:(m.a==='D'&&m.b==='A')?3000:m.d}));
             const f=C.solve(rect.map(p=>({...p})), sauber);
             const a2=C.analyze(f.pts, sauber);
             return globalThis.globalTestFails(a2.v, sig5, a2.redundancy)===false; })());
    chk('globaltest: warnt nach Wiederholung einer UNSCHULDIGEN Strecke weiter',
      (()=>{ // B-D wiederholt (konsistent 5000): sigmaHat sinkt unter den alten
             // 2,5-sigma-Faktor, der Fehler in D-A steckt aber noch im Netz.
             const mit=meas.concat([{a:'B',b:'D',d:5000,sigma:5}]);
             const f=C.solve(rect.map(p=>({...p})), mit);
             const a2=C.analyze(f.pts, mit);
             return globalThis.globalTestFails(a2.v, mit.map(()=>5), a2.redundancy)===true; })());
    chk('narrow: bereits wiederholte Paare werden nicht erneut vorgeschlagen',
      (()=>{ const mit=meas.concat([{a:'B',b:'D',d:5000,sigma:5}]);
             const f=C.solve(rect.map(p=>({...p})), mit);
             const a2=C.analyze(f.pts, mit);
             const n=globalThis.narrowCandidates(mit, a2.v, 10);
             return n.length===5 && !n.some(c=>[c.a,c.b].sort().join('')==='BD'); })());
  }
  // --- Entwirren: Winkel-Energie + kreuzungsfreie Lagesuche ---
  {
    const sq=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:4000},{id:'D',x:0,y:4000}];
    const spitz=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:4000},{id:'D',x:3990,y:30}];
    chk('entwirren: Quadrat hat kleinere Winkel-Energie als Spitznadel-Viereck',
      globalThis.ringAngleEnergy(sq, C) < globalThis.ringAngleEnergy(spitz, C));
    chk('entwirren: gekreuzter Ring hat Energie unendlich',
      globalThis.ringAngleEnergy(
        [{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:0,y:3000},{id:'D',x:4000,y:3000}], C)===Infinity);
    // Verhedderte Skizze: Zug A-B-C-D-A, aber C und D vertauscht gezeichnet
    // -> bow-tie. Eine Wand gemessen. untangle muss eine kreuzungsfreie,
    // masshaltige Lage liefern.
    const bow=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:0,y:3000},{id:'D',x:4000,y:3000}];
    const walls=[['A','B'],['B','C'],['C','D'],['D','A']];
    const meas1=[{a:'A',b:'B',d:4000,sigma:5,on:true}];
    const u=globalThis.untangle(bow.map(p=>({...p})), walls, meas1, 24, 7);
    chk('entwirren: liefert Lage', !!u && u.length===4);
    chk('entwirren: Lage ist kreuzungsfrei',
      (()=>{ if(!u) return false;
             const r=C.wallPolygonRing(u, walls);
             return !!r && !C.ringSelfIntersects(r); })());
    chk('entwirren: Masse bleiben erfuellt (<5mm)',
      (()=>{ if(!u) return false;
             return C.residuals(u, meas1).every(v=>Math.abs(v)<5); })());
    chk('entwirren: deterministisch unter gleichem Seed',
      (()=>{ const u2=globalThis.untangle(bow.map(p=>({...p})), walls, meas1, 24, 7);
             return !!u&&!!u2 && u.every((p,i)=>Math.abs(p.x-u2[i].x)<1e-9 && Math.abs(p.y-u2[i].y)<1e-9); })());
    chk('entwirren: offener Zug -> null',
      globalThis.untangle(bow.map(p=>({...p})), [['A','B'],['B','C']], meas1, 8, 1)===null);
    // Spiegelblindheit. Der Kandidat "regelmaessiges Polygon" in untangle legt
    // die Ecken IMMER gegen den Uhrzeigersinn hin - ein Raum, der andersherum
    // gezeichnet wurde, kam deshalb seitenverkehrt zurueck (am echten Raum vom
    // 23.8.2026 in 40 von 40 Laeufen, hier am kleinen L nachgebaut). Geprueft
    // wird gegen die UNGEKREUZTE Vorlage: nur die hat einen Umlaufsinn.
    {
      const sinn=P=>{ const r=C.wallPolygonRing(P, LW);
        if(!r) return 0;
        let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=r[j].x*r[i].y-r[i].x*r[j].y;
        return Math.sign(a); };
      const LW=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A']];
      const glatt=[{id:'A',x:0,y:0},{id:'B',x:8000,y:0},{id:'C',x:8000,y:2000},
                   {id:'D',x:3000,y:2000},{id:'E',x:3000,y:5000},{id:'F',x:0,y:5000}];
      // Beide Umlaufrichtungen durchspielen - der Fehler trat nur in EINER auf.
      [['wie gezeichnet', glatt], ['andersherum gezeichnet', glatt.map(p=>({...p,x:-p.x}))]]
        .forEach(([wie, vorlage])=>{
          const VI=C.idx(vorlage);
          const m=[...LW,['A','C'],['A','D'],['A','E']].map(([a,b])=>
            ({a, b, d:C.dist(vorlage[VI[a]],vorlage[VI[b]]), sigma:5, on:true}));
          // verheddern: C und D vertauschen
          const wirr=vorlage.map(p=>({...p}));
          const ci=wirr.findIndex(p=>p.id==='C'), di=wirr.findIndex(p=>p.id==='D');
          [wirr[ci].x,wirr[di].x]=[wirr[di].x,wirr[ci].x];
          [wirr[ci].y,wirr[di].y]=[wirr[di].y,wirr[ci].y];
          let gespiegelt=0, geloest=0;
          for(let seed=1;seed<=8;seed++){
            const u=globalThis.untangle(wirr.map(p=>({...p})), LW, m, 24, seed);
            if(!u) continue;
            geloest++;
            if(sinn(u)!==sinn(vorlage)) gespiegelt++;
          }
          chk(`entwirren: ${wie} -> Haendigkeit bleibt (${geloest} Loesungen)`,
            geloest>0 && gespiegelt===0);
        });
    }
  }
  // --- Wandansichten: Hoehe an der Ecke, Wandflaeche, Oeffnungen ---
  {
    const pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000}];
    const ch=globalThis.cornerHeights, ws=globalThis.wallShape;
    chk('wand: ohne Messung -> Standardhoehe, als angenommen markiert',
      (()=>{ const H=ch(pts,[]);
             return H.A.h===2500 && H.A.gemessen===false && H.C.h===2500; })());
    chk('wand: EINE Hoehenmessung gilt fuer alle Ecken',
      (()=>{ const H=ch(pts,[{kind:'h',at:'B',d:2620,on:true}]);
             return H.B.h===2620 && H.B.gemessen===true
                 && H.A.h===2620 && H.A.gemessen===false; })());
    // Meldung M-20261109-134000-cc7e70: die erste Hoehe ist die Raumhoehe,
    // weitere sind Abweichungen an ihrer Ecke - kein erfundener Mittelwert.
    chk('wand: zwei verschiedene Hoehen -> je Ecke eigener Wert, Rest erbt die ERSTE',
      (()=>{ const H=ch(pts,[{kind:'h',at:'A',d:2400,on:true},{kind:'h',at:'B',d:2600,on:true}]);
             return H.A.h===2400 && H.B.h===2600 && H.C.h===2400 && !H.C.gemessen; })());
    chk('wand: Hoehe 0 an einer Ecke ist zulaessig (Dreieckswand)',
      (()=>{ const H=ch(pts,[{kind:'h',at:'A',d:2500,on:true},{kind:'h',at:'B',d:0,on:true}]);
             const s=ws(pts,[{kind:'h',at:'A',d:2500,on:true},{kind:'h',at:'B',d:0,on:true}],'A','B');
             return H.B.h===0 && H.B.gemessen && s.hb===0 && near(globalThis.ceilingAt(s,2000),1250,1e-9); })());
    {
      // Giebelwand: Ecken 1000, First 3000 bei 1500 ab A. Gespeichert ab B
      // (2500) - die Richtung des Knicks darf keine Rolle spielen.
      const m=[{kind:'h',at:'A',d:1000,on:true},{kind:'k',id:'k1',a:'B',b:'A',x:2500,d:3000,on:true}];
      const g=ws(pts,m,'A','B'), gr=ws(pts,m,'B','A');
      chk('wand: Knick macht aus dem Trapez ein Fuenfeck, Richtung egal',
        g.poly.length===5 && g.knicks.length===1 && near(g.knicks[0].x,1500,1e-9)
        && near(gr.knicks[0].x,2500,1e-9) && g.hMax===3000);
      chk('wand: Decke laeuft ueber den Knick (Giebel)',
        near(globalThis.ceilingAt(g,1500),3000,1e-9) && near(globalThis.ceilingAt(g,750),2000,1e-9)
        && near(globalThis.ceilingAt(g,2750),2000,1e-9) && near(globalThis.ceilingAt(g,4000),1000,1e-9));
      chk('wand: Knick zaehlt nicht als Eckhoehe',
        ch(pts,m).B.h===1000 && !ch(pts,m).B.gemessen);
      chk('oeffnung: unter dem First passt eine Tuer, an der Traufe nicht',
        globalThis.openingFits(g,{x:1000,y:0,w:900,h:2000}) && !globalThis.openingFits(g,{x:3000,y:0,w:900,h:2000}));
      const kehle=ws(pts,[{kind:'h',at:'A',d:2500,on:true},{kind:'k',id:'k2',a:'A',b:'B',x:2000,d:1800,on:true}],'A','B');
      chk('oeffnung: Kehle zwischen den Enden der Oeffnung wird erkannt',
        !globalThis.openingFits(kehle,{x:1500,y:0,w:1000,h:2000})
        && globalThis.clampOpening(kehle,{x:1500,y:0,w:1000,h:2000}).h<=1800+1e-6);
      chk('oeffnung: Tuer-Vorbelegung in der Dreieckswand steht unter dem First',
        (()=>{ const tri=ws(pts,[{kind:'h',at:'A',d:0,on:true},{kind:'k',id:'k3',a:'A',b:'B',x:2000,d:3000,on:true}],'A','B');
               const o=globalThis.defaultOpening(tri,'door'); return o.h>1500 && globalThis.openingFits(tri,o); })());
    }
    chk('wand: mehrere Messungen derselben Ecke werden gemittelt',
      (()=>{ const H=ch(pts,[{kind:'h',at:'A',d:2400,on:true},{kind:'h',at:'A',d:2410,on:true}]);
             return near(H.A.h,2405,1e-9); })());
    chk('wand: stillgelegte Hoehenmessung zaehlt nicht',
      (()=>{ const H=ch(pts,[{kind:'h',at:'A',d:9999,on:false}]);
             return H.A.h===2500 && !H.A.gemessen; })());

    // DIE Kerneigenschaft: benachbarte Waende teilen ihre senkrechte Kante,
    // weil beide dieselbe Eckhoehe lesen. Ein Widerspruch ist nicht
    // formulierbar - genau dafuer haengt die Hoehe an der Ecke.
    chk('wand: Nachbarwaende teilen die gemeinsame Kante exakt',
      (()=>{ const m=[{kind:'h',at:'A',d:2400,on:true},{kind:'h',at:'B',d:2800,on:true},
                      {kind:'h',at:'C',d:2600,on:true}];
             const ab=ws(pts,m,'A','B'), bc=ws(pts,m,'B','C');
             return ab.hb===bc.ha && ab.hb===2800; })());
    chk('wand: Laenge kommt aus dem Grundriss, Form ist ein Trapez',
      (()=>{ const s=ws(pts,[{kind:'h',at:'A',d:2400,on:true},{kind:'h',at:'B',d:2800,on:true}],'A','B');
             return near(s.L,4000,1e-9) && s.ha===2400 && s.hb===2800 && s.poly.length===4; })());

    const shape={L:4000, ha:2400, hb:2800,
                 poly:[{x:0,y:0},{x:4000,y:0},{x:4000,y:2800},{x:0,y:2400}]};
    chk('wand: Decke laeuft im Trapez schraeg',
      near(globalThis.ceilingAt(shape,0),2400,1e-9)
      && near(globalThis.ceilingAt(shape,4000),2800,1e-9)
      && near(globalThis.ceilingAt(shape,2000),2600,1e-9));
    chk('oeffnung: passt innerhalb der Wand',
      globalThis.openingFits(shape,{x:1000,y:0,w:1000,h:2000})===true);
    chk('oeffnung: ragt seitlich hinaus -> passt nicht',
      globalThis.openingFits(shape,{x:3500,y:0,w:1000,h:2000})===false);
    chk('oeffnung: stoesst an die SCHRAEGE Decke -> passt nicht',
      // an x=0 ist die Decke 2400; eine 2450 hohe Oeffnung dort passt nicht,
      // obwohl sie unter der hoechsten Wandkante (2800) bliebe.
      globalThis.openingFits(shape,{x:0,y:0,w:500,h:2450})===false);
    chk('oeffnung: clamp schiebt in die Wand zurueck',
      (()=>{ const o=globalThis.clampOpening(shape,{x:-500,y:-200,w:1000,h:2000});
             return o.x===0 && o.y===0 && globalThis.openingFits(shape,o); })());
    chk('oeffnung: clamp respektiert die schraege Decke',
      (()=>{ const o=globalThis.clampOpening(shape,{x:0,y:2000,w:500,h:1000});
             return globalThis.openingFits(shape,o) && o.h<=2400+1e-6; })());
    chk('oeffnung: Tuer-Vorbelegung steht auf dem Boden und passt',
      (()=>{ const o=globalThis.defaultOpening(shape,'door');
             return o.y===0 && o.w===985 && globalThis.openingFits(shape,o); })());
    chk('oeffnung: Fenster-Vorbelegung sitzt mittig im oberen Bereich',
      (()=>{ const o=globalThis.defaultOpening(shape,'window');
             return near(o.x+o.w/2, shape.L/2, 1e-9) && o.y>0
                 && globalThis.openingFits(shape,o); })());
    // --- Oeffnungen sind exklusiv ---
    {
      const A={id:'a',x:1000,y:0,w:1000,h:2000};
      const ov=globalThis.openingsOverlap;
      chk('exklusiv: echte Ueberdeckung erkannt',
        ov(A,{id:'b',x:1500,y:500,w:1000,h:1000})===true);
      chk('exklusiv: Beruehrung an der Kante ist erlaubt',
        ov(A,{id:'b',x:2000,y:0,w:800,h:2000})===false);
      chk('exklusiv: uebereinander ohne Hoehenueberschneidung ist erlaubt',
        ov(A,{id:'b',x:1000,y:2000,w:1000,h:400})===false);
      chk('exklusiv: daneben ist erlaubt',
        ov(A,{id:'b',x:2500,y:0,w:500,h:2000})===false);
      chk('exklusiv: placeable prueft Wand UND Nachbarn',
        globalThis.openingPlaceable(shape,{id:'b',x:1500,y:0,w:900,h:1500},[A])===false
        && globalThis.openingPlaceable(shape,{id:'b',x:2100,y:0,w:900,h:1500},[A])===true);
      chk('exklusiv: eine Oeffnung kollidiert nicht mit sich selbst',
        globalThis.openingPlaceable(shape,A,[A])===true);
      chk('exklusiv: Zug gleitet waagerecht an der Nachbarin entlang',
        (()=>{ // B links von A, Ziel liegt rechts UND tiefer -> x wird
               // blockiert, die Hoehenaenderung muss trotzdem durchgehen
               const B={id:'b',x:0,y:0,w:900,h:1000};
               const r=globalThis.slideOpening(shape,B,{x:1200,y:1400},[A]);
               return r.y===1400 && r.x===0; })());
      chk('exklusiv: voll blockierter Zug laesst die Oeffnung stehen',
        (()=>{ const B={id:'b',x:0,y:0,w:900,h:2000};
               const r=globalThis.slideOpening(shape,B,{x:1100,y:0},[A]);
               return r.x===0 && r.y===0; })());
      chk('exklusiv: freier Platz wird gefunden, wenn die Vorbelegung besetzt ist',
        (()=>{ const neu={id:'c',x:1000,y:0,w:800,h:1900};
               const f=globalThis.findFreeSpot(shape,neu,[A]);
               return !!f && globalThis.openingPlaceable(shape,f,[A]); })());
      chk('exklusiv: volle Wand -> kein Platz, ehrliches null',
        (()=>{ const voll={id:'x',x:0,y:0,w:shape.L,h:2400};
               const neu={id:'y',x:0,y:0,w:800,h:1000};
               return globalThis.findFreeSpot(shape,neu,[voll])===null; })());
    }
    // --- Abwicklung: Klappgrad und Aussennormale ---
    {
      const R=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
      const W=[['A','B'],['B','C'],['C','D'],['D','A']];
      const uf=globalThis.unfoldFactor, rd=globalThis.planRefDist, on=globalThis.outerNormal;
      chk('abwicklung: Bezugsweite ist die halbe Diagonale', near(rd(R), 2500, 1e-9));
      chk('abwicklung: Fokus auf der Wandmitte -> flach (0)',
        near(uf({x:2000,y:0},{x:2000,y:0},2500), 0, 1e-12));
      chk('abwicklung: Fokus in der Raummitte -> alle Waende gleich weit auf',
        (()=>{ const f={x:2000,y:1500};
               const ab=uf({x:2000,y:0},f,2500), cd=uf({x:2000,y:3000},f,2500);
               return near(ab,cd,1e-12) && ab>0 && ab<1; })());
      chk('abwicklung: weiter weg heisst weiter aufgeklappt',
        uf({x:2000,y:0},{x:2000,y:1500},2500) < uf({x:2000,y:0},{x:2000,y:2500},2500));
      chk('abwicklung: Blick von aussen -> Wand bleibt flach',
        (()=>{ const n={x:0,y:-1};            // Aussennormale zeigt nach -y
               // Fokus liegt AUSSERHALB (bei y<0), schaut also von aussen
               return near(uf({x:2000,y:0},{x:2000,y:-3000},2500,n), 0, 1e-12); })());
      chk('abwicklung: Blick von innen -> Wand klappt auf',
        (()=>{ const n={x:0,y:-1};
               return uf({x:2000,y:0},{x:2000,y:1500},2500,n) > 0.5; })());
      chk('abwicklung: streifender Blick faellt sanft auf null',
        (()=>{ const n={x:0,y:-1};
               const steil=uf({x:2000,y:0},{x:2000,y:2000},2500,n);
               const streif=uf({x:2000,y:0},{x:3800,y:200},2500,n);
               return streif<steil && streif>=0; })());
      chk('abwicklung: gedeckelt bei 1',
        near(uf({x:0,y:0},{x:99999,y:0},2500), 1, 1e-12));
      chk('abwicklung: Schatten faellt vom Fokus weg',
        (()=>{ const d=globalThis.unfoldDir({x:1000,y:0},{x:2000,y:1500});
               return d.x<0 && d.y<0 && near(Math.hypot(d.x,d.y),1,1e-12); })());
      chk('abwicklung: Auslenkung gedeckelt bei einem Drittel der Hoehe',
        (()=>{ const b={x:2000,y:0}, d=globalThis.unfoldDir(b,{x:2000,y:1500});
               const p=globalThis.unfoldPoint(b, d, 2400, 1);
               return near(Math.hypot(p.x-b.x,p.y-b.y), 800, 1e-9); })());
      chk('abwicklung: Decken- bleibt parallel zur Bodenkante',
        (()=>{ const A={x:0,y:0}, B={x:4000,y:0}, fok={x:1200,y:1500};
               const d=globalThis.unfoldDir({x:2000,y:0}, fok);
               const up=globalThis.unfoldPoint;
               // beide Ecken um denselben Vektor versetzt -> Parallelogramm
               const oa=up(A,d,2400,1), ob=up(B,d,2400,1);
               return near(oa.x-A.x, ob.x-B.x, 1e-9) && near(oa.y-A.y, ob.y-B.y, 1e-9); })());
      chk('abwicklung: Fokus genau auf der Wandmitte -> Aussennormale rettet die Richtung',
        (()=>{ const d=globalThis.unfoldDir({x:2000,y:0},{x:2000,y:0},{x:0,y:-1});
               return near(d.x,0,1e-12) && near(d.y,-1,1e-12); })());
      chk('abwicklung: Aussennormale zeigt aus dem Raum',
        (()=>{ const C2=globalThis.CORE, poly=C2.wallPolygon(R,W);
               return W.every(([a,b])=>{
                 const n=on(R,W,a,b), I=C2.idx(R);
                 const m={x:(R[I[a]].x+R[I[b]].x)/2, y:(R[I[a]].y+R[I[b]].y)/2};
                 return !C2.pointInPoly({x:m.x+n.x*10, y:m.y+n.y*10}, poly)
                     &&  C2.pointInPoly({x:m.x-n.x*10, y:m.y-n.y*10}, poly);
               }); })());
    }
    // --- Oeffnungen im Grundriss: Luecke und Schwenkwinkel ---
    {
      // 4 x 3 Rechteck, Tuer mittig in der unteren Wand A-B.
      const R=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
      const W=[['A','B'],['B','C'],['C','D'],['D','A']];
      const ow=globalThis.openingWorld, sl=globalThis.swingLimit;
      chk('grundriss: Luecke sitzt an der richtigen Stelle der Wandlinie',
        (()=>{ const r=ow(R,'A','B',{x:1500,w:1000});
               return near(r.P.x,1500,1e-9) && near(r.P.y,0,1e-9)
                   && near(r.Q.x,2500,1e-9) && near(r.L,4000,1e-9); })());
      chk('grundriss: Normale steht senkrecht auf der Wand',
        (()=>{ const r=ow(R,'A','B',{x:0,w:1000});
               return near(r.u.x*r.n.x+r.u.y*r.n.y,0,1e-12) && near(Math.hypot(r.n.x,r.n.y),1,1e-12); })());
      chk('grundriss: freies Blatt in der Raummitte schwingt fast 180 Grad',
        (()=>{ // Angel bei (1500,0), Blatt 1000 lang, dreht in den Raum (+y)
               const a=sl(R,W,['A','B'],{x:1500,y:0},1000,0,+1);
               return a > Math.PI-0.12 && a <= Math.PI; })());
      chk('grundriss: schmaler Raum -> Blatt stoppt an der Gegenwand',
        (()=>{ // Raum nur 600 tief, Blatt 900 lang: es kann nicht weit
               // aufgehen, ohne gegen die gegenueberliegende Wand zu stossen.
               const flach=[{id:'A',x:0,y:0},{id:'B',x:3000,y:0},
                            {id:'C',x:3000,y:600},{id:'D',x:0,y:600}];
               const a=sl(flach,W,['A','B'],{x:1000,y:0},900,0,+1);
               // sin(a) muss unter 600/900 bleiben -> hoechstens ~42 Grad
               return a>0.2 && a < Math.asin(600/900); })());
      chk('grundriss: Sicherheitsabstand - der Bogen beruehrt die Wand nie ganz',
        (()=>{ const flach=[{id:'A',x:0,y:0},{id:'B',x:3000,y:0},
                            {id:'C',x:3000,y:600},{id:'D',x:0,y:600}];
               const a=sl(flach,W,['A','B'],{x:1000,y:0},900,0,+1);
               const tip={x:1000+Math.cos(a)*900, y:Math.sin(a)*900};
               // Spitze bleibt sichtbar unter der Gegenwand, nicht darauf
               return tip.y < 600-20; })());
      chk('grundriss: Blatt laenger als der Raum -> deutlich unter 90 Grad',
        (()=>{ const eng=[{id:'A',x:0,y:0},{id:'B',x:3000,y:0},
                          {id:'C',x:3000,y:400},{id:'D',x:0,y:400}];
               const a=sl(eng,W,['A','B'],{x:1000,y:0},900,0,+1);
               return a>0 && a<Math.PI/4; })());
      chk('grundriss: Drehsinn kehrt die Richtung um (nach aussen)',
        (()=>{ const rein=sl(R,W,['A','B'],{x:1500,y:0},1000,0,+1);
               const raus=sl(R,W,['A','B'],{x:1500,y:0},1000,0,-1);
               // nach aussen ist nichts im Weg -> voller Bogen
               return raus>=rein-1e-9 && raus>Math.PI-0.12; })());
    }
    // --- DXF-Export fuer Shapr3D ---
    {
      // L-Raum, asymmetrisch: der Fortsatz haengt unten rechts (Bildschirm,
      // y nach unten). Tuer in A-B, Insel als Pfeiler.
      const R=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},
               {id:'D',x:2500,y:3000},{id:'E',x:2500,y:1500},{id:'F',x:0,y:1500},
               {id:'G',x:500,y:500},{id:'H',x:800,y:500},{id:'J',x:800,y:800}];
      const W=[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A'],['G','H'],['H','J'],['J','G']];
      const ops=[{id:'o1',kind:'door',a:'A',b:'B',x:1500,w:900,swing:{type:'turn',hinge:'left'}}];
      const dxf=globalThis.roomDxf(R, W, {'A|B':175}, ops, 'Test').dxf;
      const ents=dxf ? dxf.split('ENTITIES')[1] : '';
      const lines=[...ents.matchAll(/LINE\n8\n(\w+)\n10\n(\S+)\n20\n(\S+)\n30\n0\.0\n11\n(\S+)\n21\n(\S+)/g)]
        .map(m=>({lay:m[1], a:m[2]+','+m[3], b:m[4]+','+m[5]}));
      chk('dxf: R12, mm und nur LINE/ARC',
        !!dxf && dxf.includes('$ACADVER\n1\nAC1009') && dxf.includes('$INSUNITS\n70\n4')
        && !/POLYLINE/.test(dxf) && !/\d,\d/.test(ents));
      chk('dxf: Innenkontur, Insel, Wandaussenkante und Laibungen auf EINEM Layer, an den Laibungen geteilt',
        // 6 + 3 + 6 Kanten, die Tuerwand innen und aussen an den beiden
        // Laibungen geteilt (+4), dazu die Laibungen (+2). Laibungsenden
        // treffen sich mit zwei Kantenstuecken: dreimal.
        (()=>{ const n={}; lines.filter(l=>l.lay==='GRUNDRISS').forEach(l=>{ n[l.a]=(n[l.a]||0)+1; n[l.b]=(n[l.b]||0)+1; });
               const v=Object.values(n);
               return lines.filter(l=>l.lay==='GRUNDRISS').length===21 && v.filter(c=>c===2).length===15 && v.filter(c=>c===3).length===4; })());
      chk('dxf: y gespiegelt - Ecke A (oben links am Schirm) liegt oben links im CAD',
        // Ursprung: Aussenkante links (x=-240), oben am Schirm liegt C-D
        // aussen bei y=3240 -> A wird (240, 3240), nicht (240, 175).
        lines.some(l=>l.lay==='GRUNDRISS' && l.a==='240.000,3240.000' && l.b==='1740.000,3240.000')
        && lines.some(l=>l.lay==='GRUNDRISS' && l.a==='2640.000,3240.000' && l.b==='4240.000,3240.000'));
      chk('dxf: angenommene Dicken als ausgeschalteter Hinweis-Layer',
        lines.filter(l=>l.lay==='WAND_ANGENOMMEN').length===5 && dxf.includes('LAYER\n2\nWAND_ANGENOMMEN\n70\n0\n62\n-9'));
      chk('dxf: Tuerblatt und Bogen an der Angel',
        lines.filter(l=>l.lay==='TUERBLATT').length===1
        && /ARC\n8\nTUERBLATT\n10\n1740\.000\n20\n3240\.000\n30\n0\.0\n40\n900\.000/.test(ents));
      chk('dxf: offener Raum -> kein Export',
        globalThis.roomDxf(R, W.slice(0,4), {}, [], 'x')===null);
    }
    // --- STEP-Export: Waende als Koerper ---
    {
      // 4000 x 3000, Dicke 240 (Vorgabe), Hoehe 2500. Tuer 900 x 2000 in A-B,
      // Fenster 1000 x 1200 auf 900 in B-C.
      const R=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:0,y:3000}];
      const W=[['A','B'],['B','C'],['C','D'],['D','A']];
      const h25=[{kind:'h',at:'A',d:2500,on:true}];
      const ops=[{id:'o1',kind:'door',a:'A',b:'B',x:1500,y:0,w:900,h:2000},
                 {id:'o2',kind:'window',a:'B',b:'C',x:1000,y:900,w:1000,h:1200}];
      const prep=(o,hm)=>globalThis.roomSolids(R,W,{},o,hm).solids.map(globalThis.solidPrepare);
      const S=prep(ops,h25), V=S.reduce((a,s)=>a+s.vol,0);
      chk('step: jede Wand ein Koerper, geschlossen und eben',
        S.length===4 && S.every(s=>s.dicht && s.eben));
      chk('step: Volumen = Wandring x Hoehe - Tuer - Fenster',
        near(V, (4480*3480-4000*3000)*2500 - 900*240*2000 - 1000*240*1200, 1));
      const Sch=prep(ops,[{kind:'h',at:'A',d:2500,on:true},{kind:'h',at:'C',d:2200,on:true}]);
      chk('step: schraege Decke -> geschlossen, nicht-ebene Kopfflaechen zerlegt',
        Sch.length===4 && Sch.every(s=>s.dicht && s.eben) && Sch.some(s=>s.faces.some(F=>F[0].length===3)));
      // Giebel in A-B (gespeichert andersherum) neben einer Tuer, Hoehe 0 an D.
      const Sg=prep(ops,[{kind:'h',at:'A',d:2500,on:true},{kind:'k',id:'k1',a:'B',b:'A',x:1000,d:3500,on:true}]);
      const ab=Sg.find(x=>/^Wand A-B/.test(x.name));
      chk('step: Giebelwand mit Knick und Tuer bleibt geschlossen, First im Koerper',
        Sg.length===4 && Sg.every(x=>x.dicht && x.eben && x.vol>0)
        && ab && ab.verts.some(v=>near(v[2],3500,1e-6)) && ab.vol>(4000+4480)/2*240*2500-900*240*2000);
      const S0=prep([],[{kind:'h',at:'A',d:2500,on:true},{kind:'h',at:'D',d:0,on:true}]);
      chk('step: Hoehe 0 an einer Ecke -> Waende laufen spitz zu, bleiben geschlossen',
        S0.length===4 && S0.every(x=>x.dicht && x.eben && x.vol>0));
      const Sv=prep([{id:'o1',kind:'hole',a:'A',b:'B',x:1500,y:0,w:900,h:2500},
                     {id:'o2',kind:'door',a:'B',b:'C',x:0,y:0,w:800,h:2000}],h25);
      chk('step: Oeffnung Boden bis Decke teilt die Wand, Tuer an der Ecke bleibt dicht',
        Sv.length===5 && Sv.every(s=>s.dicht && s.eben)
        && near(Sv.filter(s=>/^Wand A-B/.test(s.name)).reduce((a,s)=>a+s.vol,0), ((4000+4480)/2*240-900*240)*2500, 1));
      const st=globalThis.stepFile(S,"Bäder's");
      chk('step: Datei mit mm-Kontext, ASCII-Namen und vier Koerpern',
        st.startsWith('ISO-10303-21;') && st.includes("SI_UNIT(.MILLI.,.METRE.)")
        && st.includes("PRODUCT('Baeder''s'") && (st.match(/MANIFOLD_SOLID_BREP/g)||[]).length===4
        && !/[^\x00-\x7f]/.test(st)
        // REAL immer mit Dezimalpunkt, nie "-0."
        && [...st.matchAll(/(?:CARTESIAN_POINT|DIRECTION)\('',\(([^)]*)\)/g)].every(m=>m[1].split(',').every(v=>/^-?\d+\.\d*$/.test(v) && v!=='-0.')));
    }
    // --- Wandzungen: duenner als zwei angenommene Dicken ---
    {
      // 6000 x 5000 mit Vorsprung Q-P-O-N aus der Nordwand (300 breit, 900
      // tief) und Zunge W-V-F (160 dick), an der die Suedwand W-L als
      // Aussenwand weiterlaeuft - beides wie im Raum Hesterkamp. Dicke
      // ueberall angenommen (240), Hoehe 2500.
      const R=[{id:'A',x:0,y:0},{id:'Q',x:2000,y:0},{id:'P',x:2000,y:900},{id:'O',x:2300,y:900},
               {id:'N',x:2300,y:0},{id:'M',x:6000,y:0},{id:'L',x:6000,y:3000},{id:'W',x:4000,y:3000},
               {id:'V',x:4000,y:3160},{id:'F',x:4500,y:3160},{id:'E',x:4500,y:5000},{id:'D',x:0,y:5000}];
      const W=R.map((p,i)=>[p.id, R[(i+1)%R.length].id]);
      const h25=[{kind:'h',at:'A',d:2500,on:true}];
      const L=globalThis.wallLayout(R, W, {}, h25);
      chk('zunge: Vorsprung und Zunge erkannt, Ring vereinfacht, Waechter still',
        L.fehler.length===0 && L.zungen.map(z=>z.name).sort().join()==='Wandzunge Q-P-O-N,Wandzunge W-V-F'
        && L.bands.map(b=>b.nm).sort().join()==='A-Q,D-A,E-D,F-E,L-W,M-L,N-M,Q-N');
      chk('zunge: Aussenkontur schneidet sich nicht selbst',
        !globalThis.CORE.ringSelfIntersects(L.bands.map(b=>b.oA)));
      const S=globalThis.roomSolids(R, W, {}, [], h25).solids.map(globalThis.solidPrepare);
      // Band = Aussenpolygon - vereinfachter Ring; dazu die beiden Zungen.
      const band=(6480*5480-1500*2000)-(6000*5000-1500*2000);
      chk('zunge: Koerper dicht, Volumen = Baender + Zungen (keine Ueberlappung)',
        S.length===10 && S.every(s=>s.dicht && s.eben)
        && near(S.reduce((a,s)=>a+s.vol,0), (band+300*900+500*160)*2500, 1));
      const dx=globalThis.roomDxf(R, W, {}, [], 'Z');
      chk('zunge: DXF ohne Fehler', !!dx.dxf && dx.fehler.length===0);
      // Zunge mit abgeschraegter Spitze: kein bekanntes Muster -> der
      // Waechter meldet die Waende, statt Verdrehtes zu exportieren.
      const R2=R.slice(0,3).concat([{id:'S',x:2150,y:1000}], R.slice(3));
      const W2=R2.map((p,i)=>[p.id, R2[(i+1)%R2.length].id]);
      const r2=globalThis.roomSolids(R2, W2, {}, [], h25);
      chk('zunge: unbekanntes Muster -> Waechter nennt die Waende, kein Export',
        r2.solids.length===0 && r2.fehler.some(f=>/Q-P/.test(f) && /O-N/.test(f))
        && globalThis.roomDxf(R2, W2, {}, [], 'Z').dxf===null);
    }
    // --- Oeffnungen einmessen ---
    {
      const so=globalThis.solveOpening;
      const op={id:'o1', x:0, y:0, w:1000, h:2000};
      chk('einmessen: links gemessen -> x uebernommen',
        (()=>{ const r=so(shape, op, [{id:'m1',op:'o1',edge:'left',d:1200,sigma:5}]);
               return near(r.ziel.x,1200,1e-9) && r.x.n===1; })());
      chk('einmessen: rechts gemessen -> x von der anderen Seite gerechnet',
        (()=>{ const r=so(shape, op, [{id:'m1',op:'o1',edge:'right',d:800,sigma:5}]);
               // L 4000, Breite 1000, 800 vom rechten Rand -> x = 2200
               return near(r.ziel.x,2200,1e-9); })());
      chk('einmessen: Boden und Decke bestimmen y',
        (()=>{ const r=so(shape, op, [{id:'m1',op:'o1',edge:'bottom',d:900,sigma:5}]);
               return near(r.ziel.y,900,1e-9); })());
      chk('einmessen: Decke wird ueber der Oeffnungsmitte gerechnet (Trapez)',
        (()=>{ // Oeffnung x=1500 w=1000 -> Mitte 2000; Decke dort:
               // 2400 + (2800-2400)*2000/4000 = 2600
               const mitte={...op, x:1500};
               const r=so(shape, mitte, [{id:'m1',op:'o1',edge:'top',d:100,sigma:5}]);
               return near(r.ziel.y, 2600-2000-100, 1e-9); })());
      chk('einmessen: eine Messung je Achse -> bestimmt, aber nichts pruefbar',
        (()=>{ const r=so(shape, op, [{id:'m1',op:'o1',edge:'left',d:1200,sigma:5},
                                      {id:'m2',op:'o1',edge:'bottom',d:0,sigma:5}]);
               return r.x.n===1 && r.y.n===1 && r.x.w[0]===null && r.x.sigmaHat===null; })());
      chk('einmessen: zwei passende Messungen -> Mittel, kleine Residuen, pruefbar',
        (()=>{ const r=so(shape, op, [{id:'m1',op:'o1',edge:'left',d:1200,sigma:5},
                                      {id:'m2',op:'o1',edge:'right',d:1800,sigma:5}]);
               // rechts 1800 -> x = 4000-1000-1800 = 1200, deckungsgleich
               return near(r.ziel.x,1200,1e-9) && r.x.n===2
                   && r.x.v.every(v=>Math.abs(v)<1e-9) && r.x.red.every(x=>near(x,0.5,1e-9)); })());
      chk('einmessen: widersprechende Messungen -> Mittel und sichtbare Residuen',
        (()=>{ const r=so(shape, op, [{id:'m1',op:'o1',edge:'left',d:1200,sigma:5},
                                      {id:'m2',op:'o1',edge:'right',d:1700,sigma:5}]);
               // rechts 1700 -> x = 1300; Mittel 1250, Residuen +-50
               return near(r.ziel.x,1250,1e-9)
                   && r.x.v.map(Math.abs).every(a=>near(a,50,1e-9))
                   && r.x.sigmaHat>0; })());
      chk('einmessen: grober Ausreisser wird als verdaechtig benannt',
        (()=>{ const r=so(shape, op, [{id:'m1',op:'o1',edge:'left',d:1200,sigma:5},
                                      {id:'m2',op:'o1',edge:'left',d:1205,sigma:5},
                                      {id:'m3',op:'o1',edge:'left',d:1400,sigma:5}]);
               return r.verdacht.has('m3') && !r.verdacht.has('m1'); })());
      chk('einmessen: genaueres sigma zieht das Ergebnis staerker',
        (()=>{ const r=so(shape, op, [{id:'m1',op:'o1',edge:'left',d:1000,sigma:1},
                                      {id:'m2',op:'o1',edge:'left',d:2000,sigma:10}]);
               return r.ziel.x<1100; })());
      chk('einmessen: stillgelegte Messung zaehlt nicht',
        (()=>{ const r=so(shape, op, [{id:'m1',op:'o1',edge:'left',d:9999,sigma:5,on:false}]);
               return r.x.n===0 && r.ziel.x===op.x; })());
      chk('einmessen: ohne Messung bleibt die Lage unveraendert',
        (()=>{ const r=so(shape, {...op, x:777, y:333}, []);
               return r.ziel.x===777 && r.ziel.y===333 && r.x.n===0; })());
      // --- Gemessen schlaegt geschaetzt ---
      const se=globalThis.settleOpening;
      const fen={id:'f', x:0, y:900, w:1000, h:1200}, tuer={id:'t', x:1508, y:0, w:985, h:1985};
      const mf=[{id:'m1',op:'f',edge:'right',d:1200,sigma:5}];       // -> x = 4000-1000-1200 = 1800
      chk('ausweichen: eingemessen nimmt seine Lage, die geschaetzte Nachbarin rueckt buendig daneben',
        (()=>{ const s=se(shape, fen, [tuer, fen], mf);
               return !!s.platz && near(s.platz.x,1800,1e-9) && s.platz.y===900 && s.stoesst.length===0 && !s.wand
                   && s.weicht.length===1 && s.weicht[0].op===tuer && near(s.weicht[0].x,815,1e-9)
                   && fen.x===0 && tuer.x===1508; })());
      chk('ausweichen: zwei eingemessene, die sich ueberdecken -> nichts bewegt sich, die andere ist benannt',
        (()=>{ const s=se(shape, fen, [tuer, fen], [...mf, {id:'m2',op:'t',edge:'left',d:1508,sigma:5}]);
               return s.platz===null && s.weicht.length===0 && s.stoesst.length===1 && s.stoesst[0]===tuer && s.eng===false; })());
      chk('ausweichen: ein Hoehenmass allein haelt die Nachbarin nicht fest - seitlich ist sie geschaetzt',
        (()=>{ const f2={id:'g', x:1500, y:900, w:1000, h:1200};
               const s=se(shape, fen, [f2, fen], [...mf, {id:'m3',op:'g',edge:'bottom',d:900,sigma:5}]);
               return !!s.platz && near(s.platz.x,1800,1e-9) && s.stoesst.length===0
                   && s.weicht.length===1 && s.weicht[0].op===f2 && near(s.weicht[0].x,800,1e-9); })());
      chk('ausweichen: kein Platz zum Ausweichen -> Widerspruch statt Ueberdeckung',
        (()=>{ const breit={id:'h', x:500, y:900, w:3500, h:500};
               const s=se(shape, fen, [breit, fen], mf);
               return s.platz===null && s.stoesst[0]===breit && s.weicht.length===0 && s.eng===true; })());
      chk('ausweichen: freie Lage -> nichts weicht, nichts stoesst',
        (()=>{ const s=se(shape, fen, [{...tuer, x:0}, fen], mf);
               return near(s.platz.x,1800,1e-9) && !s.weicht.length && !s.stoesst.length; })());
      chk('ausweichen: Mass ausserhalb der Wand -> am Rand und als solches gemeldet',
        (()=>{ const s=se(shape, fen, [fen], [{id:'m1',op:'f',edge:'left',d:3500,sigma:5}]);
               const knapp=se(shape, fen, [fen], [{id:'m1',op:'f',edge:'left',d:3002,sigma:5}]);
               return near(s.platz.x,3000,1e-9) && s.wand===true && knapp.wand===false && near(knapp.platz.x,3000,1e-9); })());
      chk('ausweichen: fehlt der Platz nur wegen einer zweiten geschaetzten, rueckt die mit',
        (()=>{ const w3={L:3000, ha:2500, hb:2500, poly:[{x:0,y:0},{x:3000,y:0},{x:3000,y:2500},{x:0,y:2500}]};
               const t={id:'t', x:1008, y:0, w:985, h:1985}, f={id:'f', x:0, y:900, w:1000, h:1200}, l={id:'l', x:2100, y:1200, w:600, h:600};
               const s=se(w3, t, [t, f, l], [{id:'m1',op:'t',edge:'left',d:815,sigma:5}]);
               const fx=s.weicht.find(k=>k.op===f), lx=s.weicht.find(k=>k.op===l);
               return !!s.platz && near(s.platz.x,815,1e-9) && !s.stoesst.length && !s.eng && s.weicht.length===2
                   && !!fx && near(fx.x,1800,1e-9) && !!lx && near(lx.x,215,1e-9) && f.x===0 && l.x===2100; })());
      chk('ausweichen: Nachbarin eingemessen, aber selbst nicht auf ihrem Mass -> kein Widerspruch der beiden Masse',
        (()=>{ const w3={L:3000, ha:2500, hb:2500, poly:[{x:0,y:0},{x:3000,y:0},{x:3000,y:2500},{x:0,y:2500}]};
               const t={id:'t', x:1008, y:0, w:985, h:1985}, f={id:'f', x:0, y:900, w:1000, h:1200}, l={id:'l', x:2100, y:1200, w:600, h:600};
               const mt={id:'m1',op:'t',edge:'left',d:1515,sigma:5};
               const s=se(w3, f, [t, f, l], [mt, {id:'m2',op:'f',edge:'left',d:300,sigma:5}]);
               const echt=se(w3, f, [{...t, x:1515}, f, l], [mt, {id:'m2',op:'f',edge:'left',d:1000,sigma:5}]);
               return s.platz===null && s.stoesst[0]===t && s.eng===false && s.haengt===true
                   && echt.platz===null && echt.eng===false && echt.haengt===false; })());
      chk('wand kuerzer: geschaetzte Oeffnung rueckt an den Rand, eingemessene bleibt, zu breite bleibt',
        (()=>{ const rw=globalThis.rueckInDieWand, w24={L:2400, ha:2500, hb:2500, poly:[{x:0,y:0},{x:2400,y:0},{x:2400,y:2500},{x:0,y:2500}]};
               const f={id:'f', x:3000, y:900, w:1000, h:1200}, t={id:'t', x:1500, y:0, w:900, h:2000};
               return near(rw(w24, f, [f], []),1400,1e-9)
                   && rw(w24, f, [f], [{id:'m',op:'f',edge:'left',d:3000,sigma:5}])===null
                   && near(rw(w24, f, [f], [{id:'m',op:'f',edge:'bottom',d:900,sigma:5}]),1400,1e-9)
                   && rw(w24, {...f, x:800}, [f], [])===null
                   && rw(w24, {...f, w:2600}, [f], [])===null
                   && near(rw(w24, f, [f, t], []),500,1e-9)
                   && near(rw(w24, {...f, x:-300}, [f], []),0,1e-9); })());
      chk('ausweichen: ohne eigenes Lagemass bleibt alles, wie es ist',
        (()=>{ const s=se(shape, tuer, [tuer, fen], mf);
               return s.platz===null && !s.weicht.length && !s.stoesst.length && !s.wand; })());
    }
    chk('oeffnung: Vorbelegung passt auch in eine winzige Wand',
      (()=>{ const eng={L:700, ha:1800, hb:1800,
                        poly:[{x:0,y:0},{x:700,y:0},{x:700,y:1800},{x:0,y:1800}]};
             return ['door','window','hole'].every(k=>
               globalThis.openingFits(eng, globalThis.defaultOpening(eng,k))); })());
  }
  // --- Sanfte Kreuzungsbremse ---
  {
    const dd=globalThis.segSegDist;
    chk('bremse: kreuzende Strecken -> Abstand 0',
      dd({x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0})===0);
    chk('bremse: parallele Strecken -> echter Abstand',
      near(dd({x:0,y:0},{x:10,y:0},{x:0,y:5},{x:10,y:5}), 5, 1e-9));
    chk('bremse: Abstand ueber Endpunkte',
      near(dd({x:0,y:0},{x:10,y:0},{x:13,y:4},{x:20,y:4}), 5, 1e-9));

    // U-Form: A-B-C-D offen gezeichnet, plus eine ferne Wand E-F, die der
    // gezogene Punkt B beim Wandern nach unten kreuzen wuerde.
    //   B(0,0)-A(0,4000) ist die Kante an B; E-F liegt waagerecht bei y=-1000.
    const pts=[{id:'A',x:0,y:4000},{id:'B',x:0,y:0},
               {id:'E',x:-2000,y:-1000},{id:'F',x:2000,y:-1000}];
    const walls=[['A','B'],['E','F']];
    const soft=500;
    const dmp=globalThis.dampenDrag;
    chk('bremse: Bewegung WEG von der Gefahr bleibt ungebremst',
      (()=>{ const r=dmp(pts,walls,'B',0,300,soft);
             return near(r.dy,300,1e-9) && r.near.length===0; })());
    chk('bremse: Bewegung quer zur Gefahr bleibt ungebremst (Gleiten)',
      (()=>{ const nah=pts.map(p=>p.id==='B'?{...p,y:-800}:p);   // 200 vor der Wand
             const r=dmp(nah,walls,'B',400,0,soft);
             return near(r.dx,400,1e-6) && near(r.dy,0,1e-6); })());
    chk('bremse: Bewegung AUF die Gefahr zu wird stark gedaempft',
      (()=>{ const nah=pts.map(p=>p.id==='B'?{...p,y:-800}:p);
             const r=dmp(nah,walls,'B',0,-400,soft);
             return Math.abs(r.dy) < 400*0.25 && r.near.length===1; })());
    chk('bremse: nie ganz gesperrt - Rest kommt durch',
      (()=>{ const kante=pts.map(p=>p.id==='B'?{...p,y:-999.9}:p);
             const r=dmp(kante,walls,'B',0,-400,soft);
             return Math.abs(r.dy) > 0 && Math.abs(r.dy) < 400*0.1; })());
    chk('bremse: bereits gekreuztes Paar wird nicht bewacht',
      (()=>{ const durch=pts.map(p=>p.id==='B'?{...p,y:-2000}:p);   // A-B kreuzt E-F
             const r=dmp(durch,walls,'B',0,-400,soft);
             return near(r.dy,-400,1e-9) && r.near.length===0; })());
    chk('bremse: weit entfernt -> unveraendert, kein Aufwand',
      (()=>{ const r=dmp(pts,walls,'B',0,-100,soft);
             return near(r.dy,-100,1e-9); })());
    // Zwei Kanten EINER Ecke naehern sich derselben Wand. Ohne
    // Richtungs-Sperre daempft dasselbe Hindernis zweimal und der
    // Restdurchlass faellt unter die Zusage (browser-gemessen 1,7 % statt
    // 12 %). Ecke B liegt hier zwischen zwei Kanten A-B und B-C.
    {
      const ecke=[{id:'A',x:-3000,y:4000},{id:'B',x:0,y:0},{id:'C',x:3000,y:4000},
                  {id:'E',x:-4000,y:-300},{id:'F',x:4000,y:-300}];
      const w2=[['A','B'],['B','C'],['E','F']];
      const r=dmp(ecke,w2,'B',0,-400,soft);
      const einKanten=dmp(ecke,[['A','B'],['E','F']],'B',0,-400,soft);
      chk('bremse: zwei Kanten einer Ecke daempfen nicht doppelt',
        near(r.dy, einKanten.dy, 1e-6) && r.near.length===2);
      chk('bremse: Restdurchlass haelt die Zusage auch an der Ecke',
        (()=>{ const kante=ecke.map(p=>p.id==='B'?{...p,y:-299.9}:p);
               const rr=dmp(kante,w2,'B',0,-400,soft);
               return Math.abs(rr.dy) >= 400*0.05; })());
    }
  }
  // --- Rechte Winkel annehmen (orthoFit) ---
  {
    // Rechteck 4000 x 3000 mit einer kurzen Zunge; die Zungenmasse sind so
    // verrauscht, dass der Ausgleich dort 1-2 Grad daneben liegt.
    const mk=(pts,pairs)=>pairs.map(([a,b,e])=>{ const A=pts.find(p=>p.id===a), B=pts.find(p=>p.id===b);
      return {a,b,d:Math.hypot(A.x-B.x,A.y-B.y)+(e||0)}; });
    const R=[['A',0,0],['B',4000,0],['C',4000,3000],['D',0,3000]].map(([id,x,y])=>({id,x,y}));
    const W=[['A','B'],['B','C'],['C','D'],['D','A']];
    const meas=mk(R,[['A','B'],['B','C'],['C','D'],['D','A',6],['A','C',-5]]);
    const r=C.orthoFit(R.map(p=>({...p,x:p.x+30,y:p.y-20})),W,meas,2);
    const I=C.idx(r.fit.pts), P=r.fit.pts;
    const ang=(a,c,b)=>{ const u={x:P[I[a]].x-P[I[c]].x,y:P[I[a]].y-P[I[c]].y}, v={x:P[I[b]].x-P[I[c]].x,y:P[I[b]].y-P[I[c]].y};
      return Math.abs(Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y))*180/Math.PI; };
    chk('90°: verträgliche Ecken werden rechtwinklig', r.ortho.length>=3 && Math.abs(ang('D','A','B')-90)<0.05);
    // Parallelogramm, sauber gemessen: 3 Grad schief, mit Diagonalen - darf
    // NICHT auf 90 gezogen werden, auch wenn die Toleranz es erlaubte.
    const sh=Math.tan(1.5*Math.PI/180)*3000;
    const Q=[['A',0,0],['B',4000,0],['C',4000+sh,3000],['D',sh,3000]].map(([id,x,y])=>({id,x,y}));
    const r2=C.orthoFit(Q.map(p=>({...p})),W,mk(Q,[['A','B'],['B','C'],['C','D'],['D','A'],['A','C'],['B','D']]),2);
    chk('90°: gut gemessene schiefe Ecke bleibt schief', r2.ortho.length===0 && r2.rejected.length===4);
    chk('90°: außerhalb der Toleranz wird nichts angefasst',
      C.orthoFit(Q.map(p=>({...p})),W,mk(Q,[['A','B'],['B','C'],['C','D'],['D','A'],['A','C'],['B','D']]),1).rejected.length===0);
    chk('90°: Gewicht ändert echte Messungen nicht (ohne wt wie bisher)',
      Math.abs(C.residuals(R,[{a:'A',b:'B',d:3990}])[0]-10)<1e-9 && Math.abs(C.residuals(R,[{a:'A',b:'B',d:3990,wt:40}])[0]-400)<1e-9);
  }
  // --- Raum-Inseln (freistehende Wand, Pfeiler, Wand neben Durchbruch) ---
  {
    const P=[['A',0,0],['B',6000,0],['C',6000,4000],['D',0,4000],
             ['I',2900,1000],['J',3100,1000],['K',3100,3000],['L',2900,3000]].map(([id,x,y])=>({id,x,y}));
    const W=[['A','B'],['B','C'],['C','D'],['D','A'],['I','J'],['J','K'],['K','L'],['L','I']];
    const poly=C.wallPolygon(P,W);
    chk('inseln: zweiter geschlossener Zug wird Insel', !!poly && poly.length===4 && poly.holes.length===1);
    chk('inseln: Aussen ist der größte Zug, auch wenn die Insel zuerst kommt',
      (()=>{ const r=C.wallPolygon(P.slice(4).concat(P.slice(0,4)), W.slice(4).concat(W.slice(0,4)));
             return r && r.some(p=>p.id==='A') && r.holes[0].some(p=>p.id==='I'); })());
    chk('inseln: Fläche abzüglich Insel', !!poly && near(C.roomArea(poly), 6000*4000-200*2000, 1e-6));
    chk('inseln: Punkt in der Insel ist nicht im Raum',
      !!poly && !C.pointInPoly({x:3000,y:2000},poly) && C.pointInPoly({x:1000,y:2000},poly));
    chk('inseln: Sichtlinie durch die Insel ist nicht messbar',
      (()=>{ const Q=P.concat([{id:'E',x:1000,y:2000},{id:'F',x:5000,y:2000}]);
             return !C.pairMeasurable(Q,W,poly,'E','F'); })());
    chk('inseln: Insel außerhalb des Raums -> keine gültige Form',
      C.wallPolygon(P.map(p=>'IJKL'.includes(p.id)?{...p,x:p.x+5000}:p),W)===null);
    chk('inseln: Insel kreuzt die Außenwand -> keine gültige Form',
      C.wallPolygon(P.map(p=>p.id==='I'||p.id==='L'?{...p,x:-100}:p),W)===null);
    chk('inseln: offener zweiter Zug -> Ring noch nicht geschlossen',
      C.wallPolygonRing(P,W.slice(0,7))===null);
    // Fliesen an der Insel
    const T=globalThis.TILES, S={...T.TILE_DEF, angle:90};
    const ring=poly.map(p=>({x:p.x,y:p.y,id:p.id})); ring.holes=poly.holes.map(h=>h.map(p=>({x:p.x,y:p.y,id:p.id})));
    const st=T.tileStatus(S,{kind:'L',x:2500,y:1500,rot:0},ring,[]);
    chk('inseln: Fliese über der Insel ist geschnitten, Aussparung abgezogen',
      st.status==='cut' && st.pieces.length===1 && st.pieces[0].cutouts.length===1
      && near(st.inArea, 850*150-200*150, 1e-6));
    chk('inseln: Fliese rastet an die Inselwand',
      (()=>{ const w={kind:'L',x:2030,y:1500,rot:0};         // rechte Kante bei 2880, Insel ab 2900
             const r=T.snapGroup([T.tileCorners(S,w)], T.snapTargets({...S,edgeGap:5},[],ring,[]), 40);
             const it=r && T.moveItem(w,r.m);
             return it && near(it.x+850, 2900-5, 1e-6); })());
    chk('inseln: Dehnungsfuge von Wand an Insel gültig, durch Insel nicht',
      T.jointValid(ring,{x:0,y:2000},{x:2900,y:2000}) && !T.jointValid(ring,{x:0,y:2000},{x:6000,y:2000}));
    chk('inseln: Fugenende rastet auf die Inselwand',
      (()=>{ const e=T.jointEndSnap(ring,{x:2890,y:2000},30,'free'); return e && near(e.q.x,2900,1e-9); })());
    chk('inseln: Stückliste zieht Inselfläche ab',
      near(T.tileStats(S,[],ring,[]).roomArea, 6000*4000-200*2000, 1e-6));
    const cl=T.cutList(S,[{kind:'L',x:2500,y:1500,rot:0}],ring,[]);
    const d=T.pieceDims(S,'L',cl[0].tilePoly,cl[0].tileCutouts);
    chk('inseln: ganze Fliese mit Aussparung hat keine Schnittkanten außen',
      (()=>{ const c=T.cutList(S,[{kind:'L',x:2800,y:900,rot:0}],ring,[])[0];
             return c && T.pieceDims(S,'L',c.tilePoly,c.tileCutouts).edges.every(e=>!e.cut); })());
    chk('inseln: Schnittblatt bemaßt die Aussparung ab Fliesenecke',
      d.marks.filter(m=>m.cutout===0).map(m=>Math.round(m.dist)).sort((a,b)=>a-b).join()==='250,250,400,400');
  }
  // --- Schnittplan: gerade Durchschnitte, Anrissmasse bestimmen das Stueck ---
  {
    const T=globalThis.TILES, S={...T.TILE_DEF, w:150, l:850, angle:45};
    const P=a=>a.map(([x,y])=>({x,y}));
    // Rohfliese R8 aus dem Testraum: Dreieck in Ecke D, daneben ein schief
    // angeschnittenes Stueck (Unterkante laeuft 2,5 mm von A-B weg)
    const p21=P([[0,0],[273.45,0],[482.11,2.48],[622.64,143.01],[143.01,143.01]]);
    const p8=P([[-143,143],[100,143],[-3,3]]);
    const pl=T.cutPlan(S,'R',[{poly:p8},{poly:p21}]);
    const rp=T.replayPlan(S,'R',[{poly:p8},{poly:p21}],pl,Math.round);
    chk('schnittplan: zwei Stücke mit geraden Durchschnitten trennbar', pl.ok && pl.lines.length>=5);
    chk('schnittplan: jede Linie hat zwei Anrisspunkte auf Fliesenkanten',
      pl.marks.every(m=>m.ends && m.ends.length===2 && m.ends.every(e=>e.edge>=0 && e.dist>=0)));
    chk('schnittplan: Nachbau aus gerundeten Anrissmaßen < 1 mm an der Sollkontur',
      rp.every(q=>q.dMax<1 && q.dArea<300));
    chk('schnittplan: schräger Schnitt 273 ab A -> 10 ab B, kein Restmaß im Inneren',
      pl.marks.some(m=>{ const t=m.ends.map(e=>`${e.edge}:${e.corner}:${Math.round(e.dist)}`).sort().join(); return t==='0:0:273,1:1:10'; }));
    // Ausklinkung: L-foermiges Stueck -> eigene Linien bis zum Innenpunkt
    const L=P([[0,0],[600,0],[600,60],[300,60],[300,150],[150,150]]);
    const pn=T.cutPlan(S,'L',[{poly:L}]);
    chk('schnittplan: Ausklinkung mit Innenpunkt, ohne Durchschnitt hindurch',
      pn.ok && pn.notches.length===1 && pn.notches[0].inner.length===1
      && Math.abs(pn.notches[0].inner[0].x-300)<1e-6 && Math.abs(pn.notches[0].inner[0].y-60)<1e-6
      && T.replayPlan(S,'L',[{poly:L}],pn,Math.round)[0].dMax<1);
    // Windmuehle: kein gerader Durchschnitt trennt die vier Stuecke
    const sq=(x0,y0,w,h)=>P([[x0,y0],[x0+w,y0],[x0+w,y0+h],[x0,y0+h]]), SQ={...S, w:400, l:400, angle:90};
    const pw=T.cutPlan(SQ,'L',[{poly:sq(0,0,250,100)},{poly:sq(300,0,100,250)},{poly:sq(150,300,250,100)},{poly:sq(0,150,100,250)}]);
    chk('schnittplan: Windmühlen-Lage wird als nicht trennbar erkannt', !pw.ok);
  }
  // --- Fliesen (Chevron) ---
  {
    const T=globalThis.TILES, S={...T.TILE_DEF};
    const ring=[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}];
    const area=P=>Math.abs(T.polyArea(P));
    chk('fliesen: Fläche = Breite × Länge',
      near(area(T.tileCorners(S,{kind:'L',x:0,y:0,rot:0})),150*850,1e-6)
      && near(area(T.tileCorners({...S,angle:30},{kind:'R',x:5,y:7,rot:33})),150*850,1e-6));
    chk('fliesen: L und R sind Spiegelbilder',
      (()=>{ const a=T.tileShape(S,'L'), b=T.tileShape(S,'R'), l=S.l;
             // R = L an der Mittelsenkrechten der Unterkante gespiegelt (x -> l-x), Ecken umlaufend neu
             const m=a.map(p=>({x:l-p.x, y:p.y}));
             return m.every(p=>b.some(q=>near(p.x,q.x,1e-9)&&near(p.y,q.y,1e-9))); })());
    // Fliese an Fliese: fast parallel, etwas daneben -> exakt parallel, Abstand = Fuge
    {
      const A=T.tileCorners(S,{kind:'L',x:100,y:100,rot:0});
      const mv={id:2,kind:'L',x:130,y:257,rot:3};
      const r=T.snapGroup([T.tileCorners(S,mv)], T.snapTargets(S,[A],ring,[]), 40);
      const it=r && T.moveItem(mv,r.m);
      chk('fliesen: Snap an Fliese -> parallel, Abstand = Fuge',
        !!it && near(T.normDeg(it.rot+180)-180,0,1e-9) && near(it.y,100+150+S.joint,1e-6));
    }
    {
      // Chevron-Spalte neben Chevron-Spalte: die Nachbarreihe liegt nur eine
      // Fuge neben der richtigen Ecke - eingerastet werden muss die richtige.
      const c=45, L0={id:1,kind:'L',x:0,y:0,rot:c}, PL=T.tileCorners(S,L0);
      let R0={id:2,kind:'R',x:0,y:0,rot:360-c}; const PR=T.tileCorners(S,R0);
      R0={...R0, x:PL[1].x-PR[0].x+S.joint, y:PL[1].y-PR[0].y};
      const step=(S.w+S.joint)/Math.sin(c*Math.PI/180);          // Reihenabstand senkrecht
      const col=[]; for(let k=-2;k<=2;k++) [L0,R0].forEach(t=>col.push({...t, id:col.length+1, y:t.y+k*step}));
      const PRc=T.tileCorners(S,R0), vx=PRc[1].x+S.joint-PL[0].x;  // Soll-Versatz der naechsten Spalte
      const moving=col.map(t=>({...t, id:100+t.id, x:t.x+vx+4, y:t.y+6}));
      const r=T.snapGroup(moving.map(t=>T.tileCorners(S,t)), T.snapTargets(S,col.map(t=>T.tileCorners(S,t)),null,[]), 60);
      const it=r && T.moveItem(moving[0],r.m);
      chk('fliesen: Chevron-Spalten fluchten (keine Fuge Versatz)',
        !!it && near(it.x-col[0].x, vx, 1e-6) && near(it.y-col[0].y, 0, 1e-6));
      // Fugenkreuze: 5 Paare -> 4 Chevron-Spitzen; gerade Querfuge durch
      // eine Spitze -> dort ein Halbfaecher statt Mittelstueck
      const big=[{x:-5000,y:-5000},{x:5000,y:-5000},{x:5000,y:5000},{x:-5000,y:5000}];
      const sc=T.spacerCount(S,col,big,[]), cy=sc.midAt.map(p=>p.y).sort((a,b)=>a-b)[2], h=S.joint/2;
      const below=T.spacerCount(S,col,[{x:-5000,y:-5000},{x:5000,y:-5000},{x:5000,y:cy+h},{x:-5000,y:cy+h}],[]);
      const above=T.spacerCount(S,col,[{x:-5000,y:cy-h},{x:5000,y:cy-h},{x:5000,y:5000},{x:-5000,y:5000}],[]);
      chk('Fugenkreuze: Mittelstück je Chevron-Spitze, Halbfächer an gerader Querfuge',
        sc.mid===4 && sc.fan===0 && below.mid+below.fan===3 && above.mid+above.fan===1 && below.fan+above.fan===1);
      // schraege Fugen an der Querfuge: links und rechts je ein 45°-Stueck,
      // gespiegelt (A/B); durch die Spitze laeuft nur die naechste Fuge
      const off=T.spacerCount(S,col,[{x:-5000,y:-5000},{x:5000,y:-5000},{x:5000,y:cy+60},{x:-5000,y:cy+60}],[]);
      chk('Fugenkreuze: 45°-Stück A/B, wo schräge Fugen auf gerade Querfuge treffen',
        sc.sideA+sc.sideB===0 && off.fan===0 && off.sideA===1 && off.sideB===1 && below.sideA===1 && below.sideB===1);
      // Fries: Feld bei y=1000 abgeschnitten, darunter liegende L-Fliesen
      // (rot 0) - schraege Feldfugen und Fries-Stossfugen treffen auf die
      // durchlaufende Laengsfuge (T-Stoss Fliese an Fliese, keine Wand)
      const Y0=1000, toT=(it,p)=>{ const cc=Math.cos(-it.rot*Math.PI/180), ss=Math.sin(-it.rot*Math.PI/180), q={x:p.x-it.x,y:p.y-it.y}; return {x:q.x*cc-q.y*ss, y:q.x*ss+q.y*cc}; };
      const cutAt=sg=>col.map(it=>{ const o=toT(it,{x:0,y:0}), n1=toT(it,{x:0,y:sg}); return {...it, cuts:[{p:toT(it,{x:0,y:Y0}), n:{x:n1.x-o.x,y:n1.y-o.y}}]}; });
      let field=cutAt(1); if(Math.max(...field.flatMap(it=>T.tileCorners(S,it).map(p=>p.y)))>Y0+0.01) field=cutAt(-1);
      const fr=[]; for(let k=-2;k<4;k++) fr.push({id:100+k, kind:'L', x:k*(S.l+S.joint)-300, y:Y0+S.joint, rot:0});
      const fz=T.spacerCount(S,[...field,...fr],big,[]);
      chk('Fugenkreuze: 45°-Stücke am Fries (Fuge Fliese an Fliese)',
        fz.mid===3 && fz.fan===0 && fz.sideA+fz.sideB===3 && fz.sideA>=1 && fz.sideB>=1);
    }
    chk('fliesen: Snap an Wand -> Abstand = Randfuge',
      (()=>{ const w={kind:'L',x:500,y:6,rot:1};
             const r=T.snapGroup([T.tileCorners(S,w)], T.snapTargets({...S,edgeGap:5},[],ring,[]), 20);
             return r && near(T.moveItem(w,r.m).y,5,1e-6); })());
    chk('fliesen: Raumecke — Ecke A rastet auf die Raumecke',
      (()=>{ const w={kind:'R',x:160,y:8,rot:0};
             const r=T.snapGroup([T.tileCorners(S,w)], T.snapTargets(S,[],ring,[]), 200);
             const it=r && T.moveItem(w,r.m);
             return it && near(it.x,0,1e-6) && near(it.y,0,1e-6); })());
    chk('fliesen: zwei Wände gleichzeitig (Rechteckfliese in der Ecke)',
      (()=>{ const S9={...S,angle:90,edgeGap:3}, w={kind:'L',x:40,y:25,rot:2};
             const r=T.snapGroup([T.tileCorners(S9,w)], T.snapTargets(S9,[],ring,[]), 60);
             const it=r && T.moveItem(w,r.m);
             return it && near(it.x,3,1e-6) && near(it.y,3,1e-6) && r.lines.length===2; })());
    chk('fliesen: halb über der Wand -> Anteil stimmt',
      near(T.tileStatus(S,{kind:'L',x:3600,y:1000,rot:0},ring,[]).inArea, (400+250)/2*150, 1e-6));
    {
      const L=[{x:0,y:0},{x:3000,y:0},{x:3000,y:1000},{x:1000,y:1000},{x:1000,y:3000},{x:0,y:3000}];
      const it={kind:'L',x:800,y:800,rot:0};            // haengt in die einspringende Ecke
      const st=T.tileStatus({...S,angle:90},it,L,[]);
      // Rechteck 800..1650 x 800..950, im L-Raum: y<1000 ueberall -> alles innen
      chk('fliesen: konkaver Raum, Fliese im Knick ganz innen', st.status==='whole');
      const st2=T.tileStatus({...S,angle:90},{kind:'L',x:800,y:900,rot:0},L,[]);
      // 800..1650 x 900..1050: oberhalb y=1000 nur x<1000 innen
      chk('fliesen: konkaver Raum, Schnitt an der einspringenden Ecke',
        st2.status==='cut' && near(st2.inArea, 850*100+200*50, 1e-6));
    }
    {
      const J=[{a:{x:2000,y:0},b:{x:2000,y:3000},width:8}];
      const st=T.tileStatus(S,{kind:'L',x:1600,y:1000,rot:0},ring,J);
      chk('fliesen: Dehnungsfuge teilt die Fliese in zwei Stücke',
        st.status==='cut' && st.pieces.length===2 && near(st.inArea,150*850-8*150,1e-6));
      const cl=T.cutList(S,[{kind:'L',x:3600,y:1000,rot:0},{kind:'L',x:1600,y:1000,rot:0}],ring,J);
      chk('fliesen: Schnittstücke fortlaufend nummeriert', cl.map(c=>c.no).join()==='1,2,3');
      const d=T.pieceDims(S,'L',cl[0].tilePoly);
      chk('fliesen: Schnittmaß ab Fliesenecke', d.marks.length===2 && d.marks.some(m=>near(m.dist,396,1e-6)));
      chk('fliesen: Fuge Ecke→Wand liegt im Raum', T.jointValid(ring,J[0].a,J[0].b)
        && !T.jointValid(ring,{x:0,y:0},{x:4000,y:0}));
      const e=T.jointEndSnap(ring,{x:1990,y:15},30,'free');
      chk('fliesen: Fugenende rastet auf die Wand', e && near(e.q.y,0,1e-9) && near(e.q.x,1990,1e-9));
      chk('fliesen: Fugenende im Eckmodus nur auf Ecken',
        T.jointEndSnap(ring,{x:1990,y:15},30,'corner')===null
        && near(T.jointEndSnap(ring,{x:40,y:30},30,'corner').q.x,0,1e-9));
    }
    {
      // Randfuge 10 mm, Schnittkante bei halber Randfuge: eine Fliese, die
      // 3 mm ueber die Verlegekante ragt, ist ganz. Status an der
      // Schnittkante, Raumflaeche an der Verlegekante.
      const R=ring.map((p,i)=>({...p,id:'w'+i})); R.holes=[];
      const lay=T.insetRoom(R,()=>10), layCut=T.insetRoom(R,()=>5);
      const it={kind:'L',x:7,y:500,rot:0};              // Ecke A bei x=7, Verlegekante bei x=10
      chk('fliesen: Überstand in die halbe Randfuge bleibt ganz',
        T.tileStatus(S,it,lay,[]).status==='cut' && T.tileStatus(S,it,layCut,[]).status==='whole');
      const st=T.tileStats(S,[it],layCut,[],lay);
      chk('fliesen: Raumfläche an der Verlegekante, ganz/geschnitten an der Schnittkante',
        near(st.roomArea,3980*2980,1e-6) && st.L.whole===1 && st.pieces===0);
      // Kante 0,012 mm unter der Oberkante: die Ecken ruecken laengs um
      // Hundertstel - keine Originalkante darf ein Schnittzeichen bekommen
      const hair=[{x:-500,y:0},{x:2000,y:0},{x:2000,y:149.988},{x:-500,y:149.988}];
      const c=T.cutList(S,[{kind:'L',x:0,y:0,rot:0}],hair,[])[0];
      chk('fliesen: Haarlinie an der Fliesenecke ist keine Schnittkante',
        !!c && T.pieceDims(S,'L',c.tilePoly,c.tileCutouts).edges.every(e=>!e.cut));
    }
    {
      // Zwei Friese (Rechteckfliesen) treffen sich in einer Raumecke und
      // ueberlappen dort im Quadrat 150 x 150.
      const S9={...S,angle:90};
      const H={id:1,kind:'L',x:0,y:0,rot:0};           // waagerecht, x 0..850, y 0..150
      const V={id:2,kind:'L',x:150,y:0,rot:90};         // senkrecht, x 0..150, y 0..850
      const r=T.miterPair(S9,H,V);
      const PH=r&&T.tileCorners(S9,r[0]), PV=r&&T.tileCorners(S9,r[1]);
      chk('gehrung: danach keine Überlappung', !!r && !T.convexOverlap(PH,PV,0.01));
      chk('gehrung: je Fliese fehlt das halbe Eckquadrat (abzüglich halber Fuge)',
        !!r && [PH,PV].every(P=>{ const a=Math.abs(T.polyArea(P)), full=850*150, tri=150*150/2;
          // die halbe Fuge laeuft auf der 212 mm langen Diagonale zusaetzlich ab
          return a<=full-tri+1e-6 && a>full-tri-S9.joint*212; }));
      chk('gehrung: Schnitt unter 45° von Innen- zu Außenecke',
        !!r && (()=>{ const k=r[0].cuts[0]; return Math.abs(Math.abs(k.n.x)-Math.abs(k.n.y))<1e-9; })());
      chk('gehrung: Schnitt wandert beim Verschieben mit',
        !!r && (()=>{ const m={...r[0], x:r[0].x+1000, y:r[0].y+500};
          const a=T.tileCorners(S9,r[0]), b=T.tileCorners(S9,m);
          return a.length===b.length && a.every((p,i)=>Math.abs(b[i].x-p.x-1000)<1e-9 && Math.abs(b[i].y-p.y-500)<1e-9); })());
      chk('gehrung: Fliese gilt als geschnitten und bekommt ein Schnittblatt',
        !!r && T.cutList(S9,r,null,[]).length===2);
      chk('gehrung: Schnitte überstehen Speichern/Laden', !!r && T.normTiles({items:r}).items[0].cuts.length===1);
      chk('gehrung: nicht überlappend -> keine Gehrung', T.miterPair(S9,H,{...V,x:2000})===null);
      {
        // Zwei-Punkt-Gehrung: Fangpunkte sind die Kreuzungen der Kantenfluchten,
        // u.a. Innen- (150,150) und Aussenecke (0,0); der zweite Punkt bleibt
        // als Griff-Ende erhalten.
        const sp=T.miterSnapPoints(S9,H,V,null), has=(x,y)=>sp.some(q=>Math.hypot(q.x-x,q.y-y)<1e-6);
        chk('gehrung: Fangpunkte an den Fluchten-Kreuzungen', has(0,0) && has(150,150) && has(150,0) && has(0,150));
        const r2=T.miterAt(S9,H,V,{x:150,y:150},{x:-150,y:-150},9,null,{x:0,y:0});
        const inf=r2 && T.miterInfo(S9,r2[0],r2[1],9);
        chk('gehrung: zwei gesetzte Punkte sind die Griff-Enden',
          !!inf && Math.hypot(inf.pv.x-150,inf.pv.y-150)<1e-6 && Math.hypot(inf.end.x,inf.end.y)<1e-6);
      }
      {
        // Wie im Plan: Ecke am rechten Ende der waagerechten Fliese, die
        // senkrechte reicht oben in den Raum und unten 100 mm ueber die
        // Raumgrenze (y=150) hinaus. Flache Gehrungen muessen gehen - was
        // ausserhalb des Raums wegfaellt, ist kein Loch. Ohne Raumbezug waere
        // genau das ein Loch.
        const room=[{x:-2000,y:-2000},{x:2000,y:-2000},{x:2000,y:150},{x:-2000,y:150}];
        const V2={id:2,kind:'L',x:850,y:-600,rot:90};                     // x 700..850, y -600..250
        const base=T.miterPair(S9,H,V2,5,room);
        const at=(deg,rg)=>{ const a=deg*Math.PI/180; return base && T.miterAt(S9,base[0],base[1],{x:700,y:0},{x:Math.cos(a),y:Math.sin(a)},5,rg); };
        {
          // Insel (Wandstueck) genau unter dem Ueberlappungsbereich: was die
          // Fliesen dort verlieren, ist kein Loch im Raum.
          const room2=[{x:-2000,y:-2000},{x:2000,y:-2000},{x:2000,y:2000},{x:-2000,y:2000}];
          room2.holes=[[{x:650,y:100},{x:900,y:100},{x:900,y:400},{x:650,y:400}]];
          const b2=T.miterPair(S9,H,V2,6,room2);
          const okI=[60,45,30].every(d=>{ const a=d*Math.PI/180; return !!(b2 && T.miterAt(S9,b2[0],b2[1],{x:700,y:0},{x:Math.cos(a),y:Math.sin(a)},6,room2)); });
          chk('gehrung: Insel unter der Ecke blockiert die Gehrung nicht', okI);
          // Dritte Fliese deckt, was B abgibt: H (x 0..850, y 0..150), B senkrecht
          // x 700..850, y -600..150. Schnitt waagerecht bei y=-100: B gibt den
          // Streifen y -100..0 ab, den H NICHT deckt -> ohne Dritte ein Loch,
          // mit einer Fliese darueber keins.
          const Bv={id:3,kind:'L',x:850,y:-700,rot:90};                 // y -700..150, endet buendig mit H
          const third=[{x:600,y:-160},{x:1000,y:-160},{x:1000,y:-2},{x:600,y:-2}];
          const big=[{x:-5000,y:-5000},{x:5000,y:-5000},{x:5000,y:5000},{x:-5000,y:5000}];
          const ohne=T.miterAt(S9,H,Bv,{x:600,y:-100},{x:1,y:0},7,big);
          const mit=T.miterAt(S9,H,Bv,{x:600,y:-100},{x:1,y:0},7,big,null,[third]);
          const lOhne=(T.miterAt(S9,H,Bv,{x:600,y:-100},{x:1,y:0},7,big), T.miterAt.lastHole);
          const lMit=(T.miterAt(S9,H,Bv,{x:600,y:-100},{x:1,y:0},7,big,null,[third]), T.miterAt.lastHole);
          chk('gehrung: dritte Fliese zählt als Deckung', !!ohne && !!mit && lOhne>10000 && lMit<1000);
        }
        chk('gehrung: flache Winkel trotz überstehender Fliese ohne Lücke (Raumbezug zählt)',
          [60,45,30,20].every(d=>{ const ok=!!at(d,room), h=T.miterAt.lastHole; return ok && h<1; })
          && (at(30,null), T.miterAt.lastHole>1000));
      }
      {
        // Winkel einstellen: Drehpunkt bleibt die Innenecke, Linie auf 30° zur Laengskante von H
        const inf=T.miterInfo(S9,r[0],r[1],1);
        chk('gehrung: Drehpunkt ist die Innenecke', !!inf && Math.hypot(inf.pv.x-150,inf.pv.y-150)<1e-6);
        const a=(30+H.rot)*Math.PI/180, r30=T.miterAt(S9,r[0],r[1],inf.pv,{x:-Math.cos(a),y:-Math.sin(a)},1);
        const i30=r30 && T.miterInfo(S9,r30[0],r30[1],1);
        chk('gehrung: Winkel einstellbar (30°), weiter ohne Überlappung',
          !!r30 && Math.abs(Math.min(i30.ang%180,180-i30.ang%180)-30)<1e-6
          && !T.convexOverlap(T.tileCorners(S9,r30[0]),T.tileCorners(S9,r30[1]),0.01));
        chk('gehrung: Nachstellen ersetzt den Schnitt statt einen zweiten anzuhängen',
          !!r30 && r30[0].cuts.length===1 && r30[1].cuts.length===1);
        chk('gehrung: Drehen am anderen Ende hält dieses Ende fest',
          (()=>{ const fix=inf.end, a=(40+H.rot)*Math.PI/180;
                 const q=T.miterAt(S9,r[0],r[1],fix,{x:Math.cos(a),y:Math.sin(a)},1)
                      || T.miterAt(S9,r[0],r[1],fix,{x:-Math.cos(a),y:-Math.sin(a)},1);
                 const i2=q && T.miterInfo(S9,q[0],q[1],1);
                 return !!i2 && Math.hypot(i2.pv.x-fix.x,i2.pv.y-fix.y)<1e-6
                   && !T.convexOverlap(T.tileCorners(S9,q[0]),T.tileCorners(S9,q[1]),0.01); })());
        chk('gehrung: Linie mit Lücke wird gesetzt, die Lücke gemeldet',
          !!T.miterAt(S9,r[0],r[1],inf.pv,{x:1,y:-1},1) && T.miterAt.lastHole>1000);
      }
    }
    {
      // Fluchten: Oberkante einer schiefen, versetzten Fliese auf die Gerade
      // der Oberkante einer anderen legen.
      const S9={...S,angle:90};
      const ref=T.tileCorners(S9,{kind:'L',x:0,y:0,rot:0});            // Oberkante y=150 (p2-p3)
      const mv={kind:'L',x:1000,y:8,rot:1.5}, P=T.tileCorners(S9,mv);
      const m=T.alignMove({a:ref[2],b:ref[3]}, {a:P[2],b:P[3]});
      const Q=T.tileCorners(S9,T.moveItem(mv,m));
      chk('fluchten: Kante liegt danach auf der Bezugsgeraden',
        Math.abs(Q[2].y-150)<1e-6 && Math.abs(Q[3].y-150)<1e-6);
      chk('fluchten: kleinste Drehung, Lage längs bleibt',
        Math.abs(m.dth+1.5)<1e-9 && Math.abs((Q[2].x+Q[3].x)/2-(P[2].x+P[3].x)/2)<1);
      {
        const A={id:1,kind:'L',x:0,y:0,rot:0};                          // x 0..850, y 0..150
        // Ende an Ende, 20 mm Luecke, schief und versetzt -> fluchtend, Fuge 2 mm
        const B={id:2,kind:'L',x:870,y:8,rot:1.5};
        const r=T.alignTiles(S9,A,2,B,2); const Bq=T.moveItem(B,r.m), Q=T.tileCorners(S9,Bq);
        chk('fluchten: Ende an Ende -> Kanten auf einer Linie, Fuge = Soll',
          !r.facing && Math.abs(Q[2].y-150)<1e-6 && Math.abs(Q[3].y-150)<1e-6
          && Math.abs(Math.min(...Q.map(p=>p.x))-(850+S9.joint))<1e-6);
        // Kanten gegenueber: B unter A, Oberkante von B an Unterkante... A-Oberkante (y=150) gegen B-Unterkante
        const C={id:3,kind:'L',x:100,y:158,rot:-1};
        const r2=T.alignTiles(S9,A,2,C,0); const Q2=T.tileCorners(S9,T.moveItem(C,r2.m));
        chk('fluchten: gegenüberliegende Kanten -> parallel mit Fuge',
          r2.facing && Math.abs(Q2[0].y-(150+S9.joint))<1e-6 && Math.abs(Q2[1].y-(150+S9.joint))<1e-6);
      }
      chk('fluchten: Kante wird gefunden',
        (()=>{ const e=T.edgeAt(S9,[{id:1,kind:'L',x:0,y:0,rot:0}],{x:400,y:147},10); return e && e.i===2; })());
    }
    {
      // Verlegekante: Rechteck 4000x3000, Randfuge 3 mm, an Wand A-B eine
      // Toleranzfuge 12 mm. Konkaver Raum mit Insel ebenso.
      const R=[{x:0,y:0,id:'A'},{x:4000,y:0,id:'B'},{x:4000,y:3000,id:'C'},{x:0,y:3000,id:'D'}];
      const g=(a,b)=>(a==='A'&&b==='B')||(a==='B'&&b==='A') ? 12 : 3;
      const L=T.insetRoom(R,g);
      chk('wandfuge: Verlegekante um die Fuge je Wand versetzt',
        Math.abs(L[0].x-3)<1e-9 && Math.abs(L[0].y-12)<1e-9 && Math.abs(L[2].x-3997)<1e-9 && Math.abs(L[2].y-2997)<1e-9
        && L[0].id==='A');
      const I=[{x:1000,y:1000,id:'I'},{x:1200,y:1000,id:'J'},{x:1200,y:1200,id:'K'},{x:1000,y:1200,id:'L'}];
      const Rh=R.slice(); Rh.holes=[I];
      const Lh=T.insetRoom(Rh,()=>5);
      chk('wandfuge: Inseln wachsen um die Fuge in den Raum',
        Math.abs(T.polyArea(Lh.holes[0]))>Math.abs(T.polyArea(I)) && Math.abs(Math.abs(T.polyArea(Lh.holes[0]))-210*210)<1e-6);
      const S9={...S,angle:90};
      const st=T.tileStatus(S9,{kind:'L',x:0,y:0,rot:0},L,[]);
      chk('wandfuge: Fliese in der Ecke wird an der Verlegekante geschnitten',
        st.status==='cut' && Math.abs(st.inArea-(850-3)*(150-12))<1e-6);
    }
    {
      // Anschneiden: senkrechter Fries (x 1000..1150) schneidet waagerechte
      // Fliese, die hineinragt; der Fries bleibt unveraendert.
      const S9={...S,angle:90};
      const fr={id:1,kind:'L',x:1150,y:-200,rot:90};               // x 1000..1150, y -200..650
      const h={id:2,kind:'L',x:300,y:0,rot:0};                      // x 300..1150, y 0..150
      const r=(T.trimBy(S9,fr,h)||[])[0], P=r&&T.tileCorners(S9,r);
      chk('anschneiden: Fliese endet eine Fuge vor der schneidenden',
        !!r && Math.abs(Math.max(...P.map(p=>p.x))-(1000-S9.joint))<1e-6 && !T.convexOverlap(P,T.tileCorners(S9,fr),0.01));
      chk('anschneiden: schneidende Fliese bleibt unverändert', !fr.cuts);
      chk('anschneiden: ohne Überlappung nichts', T.trimBy(S9,fr,{...h,x:-900})===null);
      {
        // nur 1 mm Abstand (unter Fugenbreite 2): trotzdem auf Fuge schneiden
        const nah={...h, x:1000-1-850}, rn=(T.trimBy(S9,fr,nah)||[])[0], Pn=rn&&T.tileCorners(S9,rn);
        chk('anschneiden: greift auch unter Fugenbreite ohne Überlappung',
          !!rn && Math.abs(Math.max(...Pn.map(p=>p.x))-(1000-S9.joint))<1e-6);
        // Fries mitten durch eine lange Fliese: zwei Reste, beide bleiben
        const lang={id:7,kind:'L',x:600,y:0,rot:0};                     // x 600..1450 kreuzt 1000..1150
        const parts=T.trimBy(S9,fr,lang)||[];
        const xs=parts.map(q=>T.tileCorners(S9,q)).map(Q=>[Math.min(...Q.map(p=>p.x)),Math.max(...Q.map(p=>p.x))]);
        chk('anschneiden: Fliese mitten durchgeschnitten -> beide Reste bleiben',
          parts.length===2 && xs.some(([a,b])=>Math.abs(b-998)<1e-6&&Math.abs(a-600)<1e-6)
          && xs.some(([a,b])=>Math.abs(a-1152)<1e-6&&Math.abs(b-1450)<1e-6));
        chk('anschneiden: Reste einer Fliese zählen in der Stückliste als eine Fliese',
          T.tileStats(S9, parts.map((q,i)=>({...q,id:20+i,from:7})), null, []).placed===1);
        chk('anschneiden: mit voller Fuge daneben bleibt unberührt',
          T.trimBy(S9,fr,{...h, x:1000-S9.joint-850})===null);
      }
    }
    {
      // Ecke an Kreuzung: in einem sauberen Chevron fehlt eine Fliese; sie
      // liegt 20° verdreht und versetzt daneben. Ueber jede ihrer Ecken muss
      // sie exakt an ihren Platz zurueckfinden.
      const D=Math.PI/180, c=90-S.angle, L0={kind:'L',x:0,y:0,rot:c}; let R0={kind:'R',x:0,y:0,rot:360-c};
      const PL=T.tileCorners(S,L0), PR=T.tileCorners(S,R0); R0={...R0,x:PL[1].x-PR[0].x+S.joint,y:PL[1].y-PR[0].y};
      const step=(S.w+S.joint)/Math.sin(S.angle*D), vx=T.tileCorners(S,R0)[1].x+S.joint-PL[0].x;
      const it=[]; let id=1;
      for(let col=0;col<3;col++) for(let row=0;row<5;row++) for(const t of [L0,R0]) it.push({...t,id:id++,x:t.x+col*vx,y:t.y+row*step});
      const gone=it.find(q=>q.kind==='R' && Math.abs(q.y-R0.y-2*step)<1e-6 && Math.abs(q.x-R0.x-vx)<1e-6);
      const others=it.filter(q=>q!==gone), Pg=T.tileCorners(S,gone);
      chk('kreuzung: Ecke findet passend und ohne Überlappung zurück',
        [0,1,2,3].every(vi=>{ const w={...gone,rot:gone.rot+20,x:gone.x+40,y:gone.y-25};
          const r=T.matchCorner(S,[w],w,vi,Pg[vi],others,20), g=r&&r.items[0];
          return g && Math.abs(g.x-gone.x)<1e-3 && Math.abs(g.y-gone.y)<1e-3 && Math.abs(((g.rot-gone.rot)%360+540)%360-180)<1e-3; }));
    }
    {
      // An Wand anschneiden: Fliese ragt ueber die Raumecke (0,0) hinaus ->
      // beide Waende schneiden; im L-Raum an der einspringenden Ecke keiner.
      const S9={...S,angle:90};
      const room=[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}];
      const t=T.trimToRoom(S9,{kind:'L',x:-100,y:-50,rot:0},room);
      chk('an Wand: Fliese an beiden Wänden der Raumecke geschnitten',
        !!t && t.length===1 && t[0].cuts.length===2 && (()=>{ const Q=T.tileCorners(S9,t[0]);
          return Math.abs(Math.min(...Q.map(p=>p.x)))<1e-6 && Math.abs(Math.min(...Q.map(p=>p.y)))<1e-6; })());
      const L=[{x:0,y:0},{x:3000,y:0},{x:3000,y:1000},{x:1000,y:1000},{x:1000,y:3000},{x:0,y:3000}];
      {
        // Einspringende Ecke / Inselecke: die Fliese bleibt EIN Stueck
        // (Ausklinkung); die Schnittliste zieht Aussenbereich bzw. Insel ab.
        const tE=T.trimToRoom(S9,{kind:'L',x:900,y:900,rot:0},L);
        chk('an Wand: einspringende Ecke -> Fliese bleibt ein Stück (nur Ausklinkung)',
          tE===null || (tE.length===1 && !(tE[0].cuts||[]).length));
        const R1=room.slice(); R1.holes=[[{x:1000,y:1000},{x:1400,y:1000},{x:1400,y:1400},{x:1000,y:1400}]];
        const ti={id:1,kind:'L',x:500,y:1300,rot:0};
        const tr=T.trimToRoom(S9,ti,R1)||[];
        chk('an Wand: Inselecke -> ein Stück mit Ausklinkung (Inselecke)',
          tr.length===1 && (tr[0].notches||[]).length===1 && T.unionArea([tr[0].notches[0].pts])>1 && !(tr[0].cuts||[]).length);
        const R2=room.slice(); R2.holes=[[{x:1000,y:1000},{x:1400,y:1000},{x:1400,y:1500},{x:1000,y:1500}]];
        // Verbinden ueber eine Inselecke: Huellenzuwachs in der Insel zaehlt nicht
        const pa={id:2,kind:'L',x:500,y:1300,rot:0,cuts:[{p:{x:0,y:100},n:{x:0,y:-1}}]};          // y 1300..1400
        const pb={id:3,kind:'L',x:500,y:1300,rot:0,cuts:[{p:{x:0,y:100},n:{x:0,y:1}},{p:{x:500,y:0},n:{x:-1,y:0}}]}; // y>=1400, x<=1000
        chk('verbinden: Stücke um eine Inselecke -> wieder eine Fliese',
          !!T.mergeTiles(S9,[pa,pb],R2).item && !T.mergeTiles(S9,[pa,pb]).item);
      }
      {
        // Dehnungsfuge: Fliese ragt knapp darueber -> an der Fugenkante geschnitten
        const J=[{a:{x:0,y:200},b:{x:4000,y:200},width:8}];
        const parts=T.trimToRoom(S9,{kind:'L',x:500,y:60,rot:0},room,J)||[];       // y 60..210, Fuge 196..204
        const half=T.trimToRoom(S9,{kind:'L',x:500,y:130,rot:0},room,J)||[];       // halb drueben
        chk('an Wand: Fliese zur Hälfte über der Fuge -> beide Stücke bleiben', half.length===2);
        chk('an Wand: Dehnungsfuge schneidet wie eine Wand',
          parts.length===1 && Math.abs(Math.max(...T.tileCorners(S9,parts[0]).map(p=>p.y))-196)<1e-6);
      }
      chk('an Wand: Fliese ganz im Raum bleibt unberührt', T.trimToRoom(S9,{kind:'L',x:500,y:500,rot:0},room)===null);
    }
    chk('anschneiden: Schnitt merkt sich die verursachende Fliese',
      (()=>{ const S9={...S,angle:90}, fr={id:41,kind:'L',x:1150,y:-200,rot:90}, h={id:42,kind:'L',x:300,y:0,rot:0};
             const r=(T.trimBy(S9,fr,h)||[])[0]; return !!r && r.cuts[0].by===41 && T.normTiles({items:[r]}).items[0].cuts[0].by===41; })());
    {
      // Fuge durch eine Fliese: zwei Reste an den Streifenkanten, beide mit
      // bj; auch ein schmaler Rest (20 mm) bleibt.
      const S9={...S,angle:90}, j={id:77,a:{x:0,y:200},b:{x:4000,y:200},width:8};
      const parts=T.cutByJoint(S9,{id:5,kind:'L',x:500,y:74,rot:0},j)||[];          // y 74..224
      const ys=parts.map(q=>T.tileCorners(S9,q)).map(Q=>[Math.min(...Q.map(p=>p.y)),Math.max(...Q.map(p=>p.y))]);
      chk('dehnungsfuge: teilt die Fliese an beiden Streifenkanten',
        parts.length===2 && ys.some(([a,b])=>Math.abs(b-196)<1e-6) && ys.some(([a,b])=>Math.abs(a-204)<1e-6)
        && parts.every(q=>q.cuts.some(k=>k.bj===77)));
      chk('dehnungsfuge: verfehlt -> nichts', T.cutByJoint(S9,{id:6,kind:'L',x:500,y:600,rot:0},j)===null);
    }
    {
      // Verbinden: Reste einer Fliese -> wieder ganz; zwei ganze Fliesen
      // hintereinander -> zu lang; zwei kurze Stuecke -> ein Stueck mit
      // Schnitt; Stuecke mit Abstand -> keine zusammenhaengende Form.
      const S9={...S,angle:90}, j={id:78,a:{x:0,y:200},b:{x:4000,y:200},width:2};
      const parts=T.cutByJoint(S9,{id:5,kind:'L',x:500,y:100,rot:0},j);
      const r=T.mergeTiles(S9,parts), Q=r.item&&T.tileCorners(S9,r.item);
      chk('verbinden: Reste einer Fliese -> wieder eine ganze Fliese',
        !!r.item && !r.item.cuts && Math.abs(Math.abs(T.polyArea(Q))-850*150)<1e-6);
      const a={id:1,kind:'L',x:0,y:0,rot:0}, b={id:2,kind:'L',x:852,y:0,rot:0};
      chk('verbinden: zwei ganze Fliesen hintereinander -> abgelehnt (zu lang)', !T.mergeTiles(S9,[a,b]).item);
      const c={id:3,kind:'L',x:0,y:0,rot:0, cuts:[{p:{x:298,y:0},n:{x:-1,y:0}}]};                 // x 0..298
      const d={id:4,kind:'L',x:300,y:0,rot:0, cuts:[{p:{x:250,y:0},n:{x:-1,y:0}}]};               // x 300..550
      const r2=T.mergeTiles(S9,[c,d]), Q2=r2.item&&T.tileCorners(S9,r2.item);
      chk('verbinden: zwei Teilstücke -> ein Stück mit einem Schnitt, gleiche Lage',
        !!r2.item && r2.item.cuts && r2.item.cuts.length===1
        && Math.abs(Math.min(...Q2.map(p=>p.x)))<1e-6 && Math.abs(Math.max(...Q2.map(p=>p.x))-550)<1e-6);
      chk('verbinden: Stücke mit echter Lücke -> abgelehnt',
        !T.mergeTiles(S9,[d, {id:5,kind:'L',x:300,y:400,rot:0,cuts:[{p:{x:250,y:0},n:{x:-1,y:0}}]}]).item);
    }
    {
      // Ausklinkung: Ecke einer Fliese ragt in die Ecke einer anderen ->
      // nur das Dreieck (+Fuge) faellt weg, die Fliese bleibt ein Stueck.
      const S9={...S,angle:90};
      const a={id:1,kind:'L',x:0,y:0,rot:0};                                    // x 0..850, y 0..150
      const c={id:2,kind:'L',x:800,y:100,rot:45};                               // Ecke ragt hinein
      const r=T.trimBy(S9,c,a)||[];
      const st=r[0] && T.tileStatus(S9,r[0],null,[]);
      const lost=st ? 850*150-st.inArea : 0, ov=Math.abs(T.polyArea(T.clipConvex(T.tileCorners(S9,c),T.tileCorners(S9,a))));
      chk('anschneiden: Ecke ragt hinein -> Ausklinkung, ein Stück',
        r.length===1 && r[0].notches && r[0].notches.length===1 && !r[0].cuts && st.pieces.length===1);
      chk('anschneiden: Ausklinkung nimmt nur Überlappung + Fuge weg', lost>ov && lost<ov*3+500);
      chk('anschneiden: nach Ausklinkung keine Überlappung mehr', T.tileOverlapArea(S9,r[0],c)<1);
      chk('ausklinkung übersteht Speichern/Laden', T.normTiles({items:r}).items[0].notches.length===1);
    }
    {
      // Kante ziehen: angeschnittene Fliese (x 0..500) waechst bis zur
      // Grundfliese (850) und nicht weiter; Originalkante nur nach innen.
      const S9={...S,angle:90}, it={id:1,kind:'L',x:0,y:0,rot:0,cuts:[{p:{x:500,y:0},n:{x:-1,y:0}}]};
      const r1=T.moveTileEdge(S9,it,{x:500,y:0},{x:500,y:150},200), P1=T.tileCorners(S9,r1.item);
      chk('kante ziehen: Schnittkante wandert (500 -> 700)', Math.abs(Math.max(...P1.map(p=>p.x))-700)<1e-6 && !r1.atMax);
      const r2=T.moveTileEdge(S9,it,{x:500,y:0},{x:500,y:150},999);
      chk('kante ziehen: Grundfliese begrenzt, Schnitt entfällt', r2.atMax && !r2.item.cuts && Math.abs(r2.t-350)<1e-6);
      const r3=T.moveTileEdge(S9,{id:2,kind:'L',x:0,y:0,rot:0},{x:0,y:150},{x:0,y:0},50);
      chk('kante ziehen: Originalkante wächst nicht', r3.t===0 && !r3.item.cuts);
      const r4=T.moveTileEdge(S9,{id:2,kind:'L',x:0,y:0,rot:0},{x:0,y:150},{x:0,y:0},-100), P4=T.tileCorners(S9,r4.item);
      chk('kante ziehen: Originalkante nach innen -> neuer Schnitt', Math.abs(Math.min(...P4.map(p=>p.x))-100)<1e-6);
    }
    {
      // Zwei ueberlappende Ausklinkungen: Flaeche = Vereinigung, nicht Summe
      const S9={...S,angle:90}, a={id:1,kind:'L',x:0,y:0,rot:0};
      const c1={id:2,kind:'L',x:800,y:100,rot:45}, c2={id:3,kind:'L',x:820,y:110,rot:30};
      const r=T.trimBy(S9,c2,T.trimBy(S9,c1,a)[0])[0], ns=T.tileNotches(S9,r);
      const uni=T.unionArea(ns);
      chk('ausklinkung: zwei überlappende Kerben zählen einmal (bzw. verschmolzen)',
        ns.length>=1 && Math.abs((850*150-T.tileStatus(S9,r,null,[]).inArea)-uni)<1e-6);
      chk('ausklinkung: keine Überlappung mit den schneidenden Fliesen',
        T.tileOverlapArea(S9,r,c1)<1 && T.tileOverlapArea(S9,r,c2)<1);
    }
    {
      const S9={...S,angle:90};
      chk('reste: schmaler Streifen (< 10 mm) wird verworfen',
        (()=>{ const fr={id:9,kind:'L',x:1150,y:-200,rot:90};                    // x 1000..1150
               const h={id:8,kind:'L',x:156,y:0,rot:0};                          // x 156..1006: 4 mm ueber den Fries
               const r=T.trimBy(S9,fr,h)||[]; return r.length===1; })());
      // Kerbenkante ziehen: Kerbe x 500..800 -> rechte Kante 100 mm in die Kerbe = x 500..700
      const it={id:1,kind:'L',x:0,y:0,rot:0, notches:[{pts:[{x:500,y:0},{x:800,y:0},{x:800,y:100},{x:500,y:100}]}]};
      const ne=T.notchEdgeAt(S9,[it],{x:800,y:50},5);
      const r=ne && T.moveNotchEdge(S9,it,ne.ni,ne.ei,100), xs=r&&T.tileNotches(S9,r.item)[0].map(q=>q.x);
      chk('kerbe: Innenkante greifbar und verschiebbar', !!r && Math.abs(Math.max(...xs)-700)<1e-6 && Math.abs(Math.min(...xs)-500)<1e-6);
      const r2=ne && T.moveNotchEdge(S9,it,ne.ni,ne.ei,400);
      chk('kerbe: auf null gezogen -> entfällt', !!r2 && r2.removed && !r2.item.notches);
      chk('kerbe: Kante auf dem Fliesenrand ist nicht greifbar', !T.notchEdgeAt(S9,[it],{x:650,y:0},2));
    }
    {
      // Liegt unter dem Rest, den ein gerader Schnitt zusaetzlich nimmt,
      // ohnehin eine andere Fliese, wird gerade geschnitten statt gekerbt.
      const S9={...S,angle:90}, a={id:1,kind:'L',x:0,y:0,rot:0}, c={id:2,kind:'L',x:800,y:100,rot:45};
      const ohne=T.trimBy(S9,c,a)[0];
      const P=T.tileCorners(S9,a), under=[{x:-100,y:60},{x:1000,y:60},{x:1000,y:400},{x:-100,y:400}];
      const mit=T.trimBy(S9,c,a,[under])[0];
      chk('anschneiden: ohne Deckung Kerbe, mit Deckung gerader Schnitt',
        !!ohne.notches && !ohne.cuts && !!mit.cuts && !mit.notches);
    }
    {
      // Insel quer durch die Fliese -> zwei Fliesen beiderseits der Insel
      const S9={...S,angle:90}, room=[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}];
      room.holes=[[{x:1000,y:500},{x:1100,y:500},{x:1100,y:2500},{x:1000,y:2500}]];      // Wandstueck 100 breit
      const parts=T.trimToRoom(S9,{id:1,kind:'L',x:700,y:1000,rot:0},room)||[];        // x 700..1550 quer drueber
      const xs=parts.map(q=>T.tileCorners(S9,q)).map(Q=>[Math.round(Math.min(...Q.map(p=>p.x))),Math.round(Math.max(...Q.map(p=>p.x)))]);
      chk('an Wand: Insel quer durch -> zwei Stücke an den Inselkanten',
        parts.length===2 && xs.some(([a,b])=>a===700&&b===1000) && xs.some(([a,b])=>a===1100&&b===1550));
    }
    {
      // Wandzunge von aussen quer durch die Fliese -> zwei Stuecke
      const S9={...S,angle:90};
      const room=[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:1100,y:3000},{x:1100,y:500},{x:1000,y:500},{x:1000,y:3000},{x:0,y:3000}];
      const parts=T.trimToRoom(S9,{id:1,kind:'L',x:700,y:1000,rot:0},room)||[];
      const xs=parts.map(q=>T.tileCorners(S9,q)).map(Q=>[Math.round(Math.min(...Q.map(p=>p.x))),Math.round(Math.max(...Q.map(p=>p.x)))]);
      {
        // einspringende Raumecke ragt in die Fliese -> Ausklinkung, kein Schnitt
        const Lr=[{x:0,y:0},{x:3000,y:0},{x:3000,y:1000},{x:1000,y:1000},{x:1000,y:3000},{x:0,y:3000}];
        const t2=T.trimToRoom(S9,{id:1,kind:'L',x:500,y:900,rot:0},Lr)||[];     // x 500..1350, y 900..1050
        const nA=t2.length===1 && (t2[0].notches||[]).length===1 ? T.unionArea([t2[0].notches[0].pts]) : 0;
        chk('an Wand: einspringende Raumecke -> Ausklinkung 350×50', t2.length===1 && Math.abs(nA-350*50)<1);
      }
      {
        // Teil umgreift Inselecke (echter Fall, Fliese 940): L-foermige
        // Insel, das linke Teilstueck liegt neben UND unter der Inselecke
        const SP={w:150,l:850,angle:45,joint:2.5,edgeGap:10,expWidth:8};
        const lay=[{x:10,y:-10},{x:7826,y:-10},{x:7839.4,y:-3033.8},{x:7621.9,y:-3032.1},{x:7647.5,y:-7772.9},{x:4081.5,y:-7792},{x:4088.3,y:-7302.8},{x:3901.9,y:-7298.3},{x:3930.4,y:-9344},{x:10.2,y:-9334.9},{x:-2,y:-3399.3},{x:975.8,y:-3414.8},{x:967.2,y:-3062},{x:9.3,y:-3065.6}];
        lay.holes=[[{x:4077.6,y:-4670.1},{x:4085.4,y:-6349.6},{x:3902.5,y:-6351.5},{x:3891.9,y:-4283.8},{x:4242.4,y:-4274.8},{x:4252.5,y:-4674.8}]];
        const t3=T.trimToRoom(SP,{id:1,kind:'L',x:3778.3,y:-6590.4,rot:45.117705709442994},lay)||[];
        chk('an Wand: Teil umgreift Inselecke -> trotzdem zwei Stücke', t3.length===2);
      }
      chk('an Wand: Wandzunge quer durch -> zwei Stücke',
        parts.length===2 && xs.some(([a,b])=>a===700&&b===1000) && xs.some(([a,b])=>a===1100&&b===1550));
    }
    {
      // Bemassung zweier Fliesen: Rechtecke 2 mm Fuge nebeneinander
      const R=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
      const D=T.pairDims(R(0,0,100,850),R(102,0,202,850));
      const g=D.filter(c=>c.kind==='gap'), f=D.filter(c=>c.kind==='flucht');
      chk('Bemaßung: Fuge 2 mm, Fluchten oben/unten', g.length===1 && Math.abs(g[0].d-2)<1e-6 && f.length===2 && f.every(c=>c.d<1e-6));
      const W=T.pairDims(R(0,0,100,850),[{x:100,y:0},{x:700,y:600},{x:600,y:700},{x:100,y:200}]);
      chk('Bemaßung: stoßende Kanten 45°', W.some(c=>c.kind==='angle' && Math.abs(c.deg-45)<1e-6));
    }
    {
      const S9={...S,angle:90,joint:2};
      const its=[{id:1,kind:'L',x:0,y:0,rot:0},{id:2,kind:'L',x:0,y:152,rot:0},{id:3,kind:'L',x:0,y:303,rot:0}];
      const F=T.jointCheck(S9,its);
      chk('Fugencheck: 1 mm zu nah erkannt, Sollfuge nicht', F.length===1 && F[0].a===2 && F[0].b===3 && Math.abs(F[0].d-1)<1e-6);
      // leicht verdreht: Keilfuge 2 mm -> ca. 5 mm ueber 850 mm Laenge
      const W=T.jointCheck(S9,[{id:1,kind:'L',x:0,y:0,rot:0},{id:2,kind:'L',x:0,y:152,rot:0.2}]);
      chk('Fugencheck: Keilfuge einer leicht verdrehten Fliese', W.length===1 && W[0].dmin<2.1 && W[0].dmax>4.5);
      {
        // Chevron-Spitze: schraege Fugen von oben und unten treffen sich auf
        // der Mittelfuge - bei s=0 in einem Punkt, bei s=5 versetzt
        const k=2*Math.SQRT2, SP={...S9,joint:2};
        const quads=s=>[
          [{x:-500,y:1},{x:0,y:1},{x:300,y:301},{x:-500,y:301}],
          [{x:k,y:1},{x:500,y:1},{x:500,y:301},{x:300+k,y:301}],
          [{x:-500,y:-301},{x:s+300,y:-301},{x:s,y:-1},{x:-500,y:-1}],
          [{x:s+k,y:-1},{x:500,y:-1},{x:500,y:-301},{x:s+300+k,y:-301}]];
        const ok=T.jointOffsets(SP,quads(0)), bad=T.jointOffsets(SP,quads(5));
        chk('Fugencheck: Fugenversatz an Chevron-Spitze erkannt', ok.length===0 && bad.length===1 && Math.abs(bad[0].d-5)<0.01);
        chk('Fugencheck: an der Wand angeschnittene Stücke zählen nicht',
          T.jointOffsets(SP,quads(5),undefined,[false,false,true,false]).length===0);
      }
      {
        // zweite Kerbe fast in der ersten -> verschmelzen statt stapeln
        const E={pts:[{x:869.3,y:19.3},{x:775.1,y:18.7},{x:794.8,y:0},{x:850,y:0}], by:1};
        const M=T.mergeNotch([E],{pts:[{x:776.9,y:20.4},{x:777.4,y:0},{x:798.4,y:0}], by:2});
        const W=T.mergeNotch([E],{pts:[{x:100,y:0},{x:120,y:0},{x:110,y:10}], by:2});
        chk('Kerben: überlappende verschmelzen, getrennte bleiben', M.length===1 && W.length===2);
      }
      {
        const m=T.squareMove({a:{x:0,y:0},b:{x:100,y:0}}, {a:{x:0,y:0},b:{x:100,y:10}});
        chk('Fluchten: rechter Winkel dreht Kante senkrecht', Math.abs(Math.abs(m.dth+Math.atan2(10,100)/Math.PI*180)-90)<1e-9 && m.dx===0);
      }
      {
        // Recycling: zwei kleine Endstuecke (je 200 lang) passen mit 30 mm
        // Schnittbreite in EINE Rohfliese (850), ein 700er nicht dazu
        const S9={...S,angle:90};
        const strip=(a,b)=>[{x:a,y:0},{x:b,y:0},{x:b,y:150},{x:a,y:150}];
        const mk=(no,id,P)=>({no, item:{id,kind:'L'}, tilePoly:P, area:Math.abs(T.polyArea(P))});
        const r=T.nestCuts(S9,[mk(1,1,strip(0,200)), mk(2,2,strip(0,200)), mk(3,3,strip(0,700))]);
        const st1=r.stocks[r.byNo.get(1)], st2=r.stocks[r.byNo.get(2)];
        const gap=st1===st2 ? Math.min(...st1.pieces[1].poly.map(p=>p.x))-Math.max(...st1.pieces[0].poly.map(p=>p.x)) : -1;
        chk('Recycling: zwei Reste in einer Rohfliese, 700er allein', r.stocks.length===2 && st1===st2 && Math.abs(gap)>=30-1e-6);
        const r2=T.nestCuts(S9,[mk(1,1,strip(0,420)), mk(2,2,strip(0,420))]);
        chk('Recycling: ohne 30 mm Platz kein Teilen', r2.stocks.length===2);
        const fa=(no,id,P,x)=>({...mk(no,id,P), c:{x,y:0}});
        const r3=T.nestCuts(S9,[fa(1,1,strip(0,200),0), fa(2,2,strip(0,200),1600)]);
        const r4=T.nestCuts(S9,[fa(1,1,strip(0,200),0), fa(2,2,strip(0,200),1400)]);
        chk('Recycling: nur innerhalb 1,5 m im Raum kombiniert', r3.stocks.length===2 && r4.stocks.length===1);
        // L/R-Ausgleich: ein Streifen ohne Stirnseiten (tauschbar) geht bei
        // L-Ueberhang in eine neue R-Rohfliese - aber nur, wenn erlaubt
        const S45={...S,angle:45};
        const mid=[{x:300,y:0},{x:500,y:0},{x:500,y:150},{x:300,y:150}];
        const cL=(no,id,P,ok)=>({no, item:{id,kind:'L'}, tilePoly:P, area:Math.abs(T.polyArea(P)), maySwap:ok});
        const b1=T.nestCuts(S45,[cL(1,1,mid,true)],30,1500,{base:{L:5,R:3}});
        const b2=T.nestCuts(S45,[cL(1,1,mid,false)],30,1500,{base:{L:5,R:3}});
        const end=[{x:0,y:0},{x:850,y:0},{x:900,y:50},{x:50,y:50}];           // volle Laenge, beide L-Schraegen: passt nur in L
        const b3=T.nestCuts(S45,[cL(1,1,end,true)],30,1500,{base:{L:5,R:3}});
        chk('L/R-Ausgleich: tauschbares Stück wandert zur knappen Sorte, gebundenes nicht',
          b1.stocks[0].kind==='R' && b1.swapped===1 && b2.stocks[0].kind==='L' && b3.stocks[0].kind==='L');
      }
      {
        // Dehnungsfuge durch Fliese mit Kerbe: Kerbe zaehlt nur im Teil, in dem sie liegt
        const S9={...S,angle:90};
        const it={id:1,kind:'L',x:0,y:0,rot:0,notches:[{pts:[{x:500,y:0},{x:850,y:0},{x:850,y:150},{x:500,y:150}],by:9}]};
        const j={id:5,a:{x:400,y:-1000},b:{x:400,y:1000},width:8};
        const parts=T.cutByJoint(S9,it,j)||[], st=parts.map(q=>T.tileStatus(S9,q,null,[j]));
        chk('Dehnungsfuge + Ausklinkung: Teil ohne Kerbe bleibt ganz erhalten',
          parts.length>=1 && st.some(x=>x.status!=='out' && Math.abs(x.inArea-396*150)<1));
      }
      {
        // Fuge endet mitten ueber der Fliese: zwei Teile, nichts faellt weg
        const S9={...S,angle:90};
        const it={id:1,kind:'L',x:0,y:0,rot:0};                 // x 0..850, y 0..150
        const j={id:5,a:{x:400,y:75},b:{x:2000,y:75},width:8};   // beginnt bei x=400
        const parts=T.cutByJoint(S9,it,j)||[];
        const sum=parts.reduce((a,q)=>a+T.tileStatus(S9,q,null,[j]).inArea,0);
        chk('Dehnungsfuge endet über der Fliese: zwei Teile, Fläche bleibt', parts.length===2 && sum>850*150-8*850-1);
      }
      {
        // Luecke: zwei Fliesen mit 100 mm Abstand -> ~85 x 1000 mm frei, Sollfuge nicht
        const S9={...S,angle:90,joint:2};
        const room=[{x:0,y:0},{x:850,y:0},{x:850,y:400},{x:0,y:400}];
        const U=T.uncovered(S9,[{id:1,kind:'L',x:0,y:0,rot:0},{id:2,kind:'L',x:0,y:250,rot:0}],room,[],10);
        const V=T.uncovered(S9,[{id:1,kind:'L',x:0,y:0,rot:0},{id:2,kind:'L',x:0,y:152,rot:0},{id:3,kind:'L',x:0,y:304,rot:0}],room,[],10);
        chk('Fugencheck: Lücke erkannt, normale Fugen nicht', U.comps.length===1 && Math.abs(U.area-850*100)<850*30 && V.area<=850*10);
      }
      {
        // Fugenmoertel: zwei Fliesen 850 lang, 2 mm Fuge, 10 mm stark -> 1700 mm², 0,017 l
        const S9={...S,angle:90,joint:2,thick:10};
        const g=T.groutAmount(S9,[{id:1,kind:'L',x:0,y:0,rot:0},{id:2,kind:'L',x:0,y:152,rot:0}]);
        chk('Fugenmörtel: Fläche und Volumen', Math.abs(g.area-1700)<1e-6 && Math.abs(g.litre-0.017)<1e-9);
        // Randfuge 10 mm um 1000x500: Band 1000*500-980*480 = 29600 mm² -> +0,296 l
        const rm=[{x:0,y:0},{x:1000,y:0},{x:1000,y:500},{x:0,y:500}];
        const ge=T.groutAmount(S9,[{id:1,kind:'L',x:0,y:0,rot:0},{id:2,kind:'L',x:0,y:152,rot:0}],rm,T.insetRoom(rm,()=>10));
        chk('Fugenmörtel: Randfuge zählt mit', Math.abs(ge.edgeArea-29600)<1e-3 && Math.abs(ge.litre-0.017-0.296)<1e-6);
      }
      chk('Fugencheck: 0,1 mm Abweichung wird toleriert',
        T.jointCheck(S9,[{id:1,kind:'L',x:0,y:0,rot:0},{id:2,kind:'L',x:0,y:152.1,rot:0}]).length===0);
    }
    chk('dehnungsfuge: 90° zur Wand rastet und läuft bis zur Gegenwand',
      (()=>{ const r=T.jointRayEnd(ring,{x:1000,y:0},{x:1,y:0},{x:1100,y:900},15);
             return r && Math.abs(r.q.x-1000)<1e-6 && Math.abs(r.q.y-3000)<1e-6 && Math.abs(r.deg-90)<1e-9; })());
    chk('dehnungsfuge: 15°-Raster', (()=>{ const r=T.jointRayEnd(ring,{x:1000,y:0},{x:1,y:0},{x:1900,y:1000},15);
             return r && Math.abs(r.deg-45)<1e-9; })());
    chk('fliesen: Weiterstrecken läuft über die Stufe eines Stufenraums hinaus',
      (()=>{ const st=[{x:0,y:0},{x:4000,y:0},{x:4000,y:1000},{x:2000,y:1000},{x:2000,y:3000},{x:0,y:3000}];
             // Spalte im niedrigen Teil (x=3100): endet sie an der Stufe (y=1000),
             // erreicht die seitlich kopierte Spalte den hohen Teil nie.
             const add=T.extendItems({...S,angle:90},[{kind:'L',x:3100,y:0,rot:0}],{x:0,y:152},st);
             return add.some(t=>t.y>2800); })());
    chk('fliesen: Weiterstrecken bis zur Wand',
      T.extendItems(S,[{kind:'L',x:0,y:0,rot:0}],{x:852,y:0},ring).length===5);
    {
      const L=T.printLayout(ring,[{w:190,h:237,landscape:false},{w:277,h:150,landscape:true}]);
      const w=L.w*L.scale, h=L.h*L.scale;
      chk('fliesen: Druck füllt das Blatt', w<=L.box.w+1e-6 && h<=L.box.h+1e-6
        && Math.max(w/L.box.w, h/L.box.h)>0.999);
    }
    {
      const n=T.normTiles({spec:{angle:200,joint:-1},items:[{kind:'L',x:1,y:2,rot:-15,id:4},{kind:'X'},{kind:'R',x:0,y:0,rot:0,id:4}]});
      chk('fliesen: Import tolerant (Winkel begrenzt, kaputte Einträge weg, IDs eindeutig)',
        n.spec.angle===90 && n.spec.joint===T.TILE_DEF.joint && n.items.length===2
        && n.items[0].rot===345 && new Set(n.items.map(i=>i.id)).size===2 && n.seq>n.items[1].id);
      chk('fliesen: fehlendes Feld -> leere Verlegung', T.normTiles(undefined).items.length===0);
    }
  }
  // --- kueche ---
  {
    const KX=globalThis.KITCHEN;
    const rect=(w,h)=>({pts:[{id:'A',x:0,y:0},{id:'B',x:w,y:0},{id:'C',x:w,y:h},{id:'D',x:0,y:h}],
                        walls:[['A','B'],['B','C'],['C','D'],['D','A']]});
    const R=rect(4000,3000);
    const win={id:'o1',kind:'window',a:'A',b:'B',x:1500,w:1000,y:1000,h:1200,swing:{type:'turntilt',hinge:'left',out:false}};
    const door={id:'o2',kind:'door',a:'C',b:'D',x:400,w:900,y:0,h:2000,swing:{type:'turn',hinge:'left',out:false}};
    const E=KX.makeEnv(R.pts,R.walls,[win,door],[]);
    const lay=items=>{ const K=KX.normKitchen({items}); const L=KX.layout(E,K); return {K,L,F:KX.check(E,K,L)}; };
    const has=(F,re,lvl)=>F.some(f=>re.test(f.txt) && (!lvl || f.lvl===lvl));
    chk('kueche: fehlendes Feld -> leere Küche', KX.normKitchen(undefined).items.length===0 && KX.isEmpty(KX.normKitchen(null)));
    {
      const n=KX.normKitchen({spec:{plinth:-5, baseH:720}, items:[{id:3,kind:'base',a:'A',b:'B',x:0,w:600},{kind:'xx'},{id:3,kind:'wall',a:'A',b:'B',x:0,w:600,store:['teller','quatsch']},{kind:'table',x:'a'}]});
      chk('kueche: Import tolerant (Grenzen, kaputte Teile weg, IDs eindeutig, unbekannte Inhalte weg)',
        n.spec.plinth===0 && n.items.length===2 && new Set(n.items.map(i=>i.id)).size===2
        && n.items[1].store.length===1 && n.seq>Math.max(...n.items.map(i=>i.id)));
    }
    chk('kueche: Arbeitshöhe = Sockel + Korpus + Platte, Hängeschrank oben bündig mit Hochschrank',
      (()=>{ const D=KX.derived(KX.K_DEF); return D.workH===150+720+40 && D.wallZ+KX.K_DEF.wallH===D.tallTop; })());
    chk('kueche: Innennormalen zeigen in den Raum (alle vier Wände)',
      [...E.wallsByKey.values()].every(W=>{ const Wf=KX.wallFrame(E,W.a,W.b), p=KX.wpt(Wf,Wf.L/2,100); return TILES.pointInRoom(p,E.ring); }));
    {
      // Spitze Ecke: Front darf nicht in die Nachbarwand laufen -> d*cot(60°)
      const pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:3000/Math.tan(Math.PI/3),y:3000}];
      // Innenwinkel an A zwischen A->B und A->D: 60°
      const E2=KX.makeEnv(pts,[['A','B'],['B','C'],['C','D'],['D','A']],[],[]);
      const Wf=KX.wallFrame(E2,'A','B'), s=KX.cornerStop(E2,Wf,580,0);
      chk('kueche: schiefe Ecke (60°) schiebt den Korpus um d·cot θ von der Ecke', near(s, 580/Math.tan(Math.PI/3), 1));
      chk('kueche: rechte Ecke braucht keinen Abstand', near(KX.cornerStop(E2,Wf,580,1),0,1e-6));
    }
    {
      // Über Eck: zweite Zeile beginnt an der Front der ersten; Platten stoßen.
      // Eckschrank an D–A läuft in die Ecke (Halbeckschrank 100 cm), Zeile A–B davor.
      const {K,L}=lay([{id:1,kind:'base',a:'D',b:'A',x:2000,w:1000,front:'door'}]);
      const Wf=KX.wallFrame(E,'A','B');
      const x=KX.freeSlot(E,K,L,{id:9,kind:'base',w:600},Wf);
      chk('kueche: Innenecke – freie Stelle beginnt an der Front der Nachbarzeile plus 50 mm Passblende', near(x,630,1));
      const K2=KX.normKitchen({items:[{id:1,kind:'base',a:'D',b:'A',x:2000,w:1000,front:'door'},{id:2,kind:'base',a:'A',b:'B',x:580,w:600}]});
      const L2=KX.layout(E,K2), tops=L2.tops;
      chk('kueche: Platten über Eck überlappen nicht (eine läuft durch, die andere stößt an)',
        tops.length===2 && !TILES.convexOverlap(tops[0].poly, tops[1].poly, 1));
      const F2=KX.check(E,K2,L2);
      chk('kueche: Halbeckschrank über Eck – Hinweis statt Fehler', !F2.some(f=>f.lvl==='bad') && F2.some(f=>/Eckschrank/.test(f.txt)));
      const K3=KX.normKitchen({items:[{id:1,kind:'base',a:'D',b:'A',x:2400,w:600},{id:2,kind:'base',a:'A',b:'B',x:580,w:600}]});
      chk('kueche: 60er-Schrank in der Ecke hinter der Nachbarzeile – Front zu', KX.check(E,K3,KX.layout(E,K3)).some(f=>f.lvl==='bad' && /verdeckt/.test(f.txt)));
    }
    {
      const sink=x=>({id:1,kind:'base',dev:'sink',a:'A',b:'B',x,w:600});
      chk('kueche: Spüle vorm Fenster – Flügel schlägt an die Armatur', has(lay([sink(1700)]).F, /schlägt an die Armatur/, 'bad'));
      chk('kueche: Vorfensterarmatur (60 mm) passt unter den Flügel', !has(lay([{...sink(1700), faucetH:60}]).F, /Armatur/));
      chk('kueche: Spüle neben dem Fenster – kein Flügelbefund', !has(lay([sink(200)]).F, /Armatur/));
      chk('kueche: Kippfenster schwenkt nicht – kein Befund',
        (()=>{ const E3=KX.makeEnv(R.pts,R.walls,[{...win,swing:{type:'tilt',out:false}}],[]); const K=KX.normKitchen({items:[sink(1700)]}); return !KX.check(E3,K,KX.layout(E3,K)).some(f=>/Armatur/.test(f.txt)); })());
    }
    chk('kueche: Hängeschrank vorm Fenster wird gemeldet', has(lay([{id:1,kind:'wall',a:'A',b:'B',x:1600,w:600}]).F, /verdeckt ein Fenster/, 'bad'));
    chk('kueche: Schrank vor der Tür wird gemeldet', has(lay([{id:1,kind:'base',a:'C',b:'D',x:500,w:600}]).F, /vor der Tür|Zimmertür/, 'bad'));
    // Meldung M-20261109-145411-a0f040: die Tür bleibt an der Insel stehen.
    (()=>{ const isl=(x,y)=>lay([{id:1,kind:'island',x,y,rot:0,w:1200,d:600}]);
      const r=isl(3100,2400), rc=KX.doorReach(E,r.L).get('o2'), far=KX.doorReach(E,isl(2000,1500).L).get('o2');
      chk('kueche: Zimmertür bleibt an der Insel stehen (Winkel im Befund), frei geht sie ganz auf',
        rc && rc.hitId===1 && rc.deg>0 && rc.deg<90 && has(r.F, new RegExp(`Zimmertür schlägt an Insel 120 – geht nur ${rc.deg}° auf`), 'bad')
        && far && far.hit===null && far.deg===far.maxDeg && far.maxDeg>=90);
      chk('kueche: freie Insel vor der Tür – ohne „an der Nachbarwand“', has(r.F, /^Insel 120 steht vor einer Tür$/, 'bad') && !has(r.F, /Insel.*Nachbarwand/));
    })();
    // Meldung M-20261109-145755-b3f684: die Insel hat eine Arbeitsplatte.
    (()=>{ const r=lay([{id:1,kind:'base',a:'A',b:'B',x:0,w:600},{id:2,kind:'island',x:2000,y:1500,rot:0,w:1800,d:900,bar:381}]), S=KX.stock(r.K,r.L);
      chk('kueche: Stückliste mit Inselplatte samt Tresen-Überstand', S.tops.length===2 && S.tops.some(t=>t.island && t.len===1800 && t.depth===1281) && S.tops.some(t=>!t.island && t.len===600)); })();
    // Meldung M-20261109-150126-3b7705: optimal einräumen, exakt und deterministisch.
    chk('kueche: jede Ablaufkette hat höchstens einen Inhalt (Voraussetzung für exaktes Einräumen)',
      KX.FLOWS.every(F=>F.chains.every(ch=>new Set(ch.filter(x=>KX.CONTENTS.some(c=>c.key===x && !c.fixed))).size<=1)));
    (()=>{ const items=[{id:1,kind:'tall',a:'A',b:'B',x:0,w:600,dev:'fridge'},{id:2,kind:'base',a:'A',b:'B',x:600,w:600},
        {id:3,kind:'base',a:'A',b:'B',x:1200,w:600,dev:'sink'},{id:4,kind:'base',a:'A',b:'B',x:1800,w:600,dev:'dw'},
        {id:5,kind:'base',a:'A',b:'B',x:2400,w:900,dev:'hob'},{id:6,kind:'base',a:'B',b:'C',x:700,w:600,front:'door'},
        {id:7,kind:'wall',a:'A',b:'B',x:600,w:600},{id:8,kind:'tall',a:'B',b:'C',x:1300,w:600},
        {id:9,kind:'table',x:1500,y:2200,rot:0,w:1400,d:800},{id:10,kind:'island',x:1800,y:1300,rot:0,w:1200,d:600,store:['besteck']}];
      const r=lay(items), O=KX.optimalStore(E,r.K,r.L), O2=KX.optimalStore(E,r.K,r.L);
      const base=KX.flows(E,r.K,r.L), ev=a=>KX.flows(E,r.K,r.L,{assign:a,planner:base.planner,memo:base.memo,partial:true}).cost;
      const g=id=>r.L.byId.get(id), drawer=id=>KX.frontKind(g(id).it)==='drawer';
      let better=0; Object.keys(O.assign).forEach(c=>{ if(c==='muell'||c==='putz') return; r.L.G.forEach(h=>{ if(h.wing || !KX.storable(h.it,r.K.spec).includes(c) || ((c==='besteck'||c==='messer') && !drawer(h.it.id))) return;
        const a={...O.assign,[c]:[h.it.id]}, onH=Object.entries(a).filter(([,ids])=>ids.includes(h.it.id)).map(([k])=>k);
        if(KX.storeFits(h.it,r.K.spec,onH) && ev(a)<O.cost-1) better++; }); });
      chk('kueche: optimal einräumen – Kosten zerfallen je Inhalt (exakt), kein Einzelumzug besser, immer dieselbe Einteilung',
        Math.abs(O.cost-O.costSum)<1e-6*O.cost && better===0 && JSON.stringify(O.assign)===JSON.stringify(O2.assign) && O.completeAfter===KX.FLOWS.length);
      chk('kueche: optimal einräumen – Besteck in Schublade, Müll an der Spüle, alles eingeräumt, als Fortschritt erkannt',
        drawer(O.assign.besteck[0]) && g(O.assign.muell[0]).it.dev==='sink' && !O.unplaced.length && O.better && O.placedAfter===Object.keys(O.assign).length);
      // Vorher alles eingeräumt (die optimale Einteilung), dazu Teller in
      // einem zweiten Schrank: Teller bleiben doppelt, Ergebnis nie schlechter.
      const st=new Map();
      Object.entries(O.assign).forEach(([k,ids])=>ids.forEach(id=>st.set(id,[...(st.get(id)||[]),k])));
      const room=k=>r.L.G.find(h=>!h.wing && KX.storable(h.it,r.K.spec).includes(k) && !O.assign[k].includes(h.it.id) && KX.storeFits(h.it,r.K.spec,[...(st.get(h.it.id)||[]),k]));
      const tw=room('teller').it.id; st.set(tw, [...(st.get(tw)||[]),'teller']);
      const dup=lay(items.map(it=>({...it, store:st.get(it.id)}))), Od=KX.optimalStore(E,dup.K,dup.L);
      chk('kueche: optimal einräumen – doppelt Eingeräumtes bleibt, Ergebnis nie schlechter als vorher',
        Od.fixed.includes('teller') && Od.assign.teller.length===2 && Od.assign.teller.includes(tw) && Od.cost<=Od.costStart+1);
    })();
    chk('kueche: Überlappung gleicher Höhenlage wird gemeldet, Hängeschrank über Unterschrank nicht',
      has(lay([{id:1,kind:'base',a:'D',b:'A',x:0,w:600},{id:2,kind:'base',a:'D',b:'A',x:300,w:600}]).F, /überlappen/)
      && !has(lay([{id:1,kind:'base',a:'D',b:'A',x:0,w:600},{id:2,kind:'wall',a:'D',b:'A',x:0,w:600}]).F, /überlappen/));
    chk('kueche: offene Spülmaschinentür stößt an die Insel davor',
      has(lay([{id:1,kind:'base',dev:'dw',a:'D',b:'A',x:1200,w:600},{id:2,kind:'island',x:1100,y:1500,rot:90,w:1200,d:600}]).F, /Spülmaschinentür.*stößt/));
    chk('kueche: Kühlschrank mit Angel an der Wand wird gemeldet, mit Angel zur Zeile nicht',
      (()=>{ // D->A: x=0 liegt bei D. Wer vor der Wand D–A steht, schaut nach
        // links (-x); rechts ist oben (-y), D liegt also links: Angel links = an der Wand C–D.
        const F1=lay([{id:1,kind:'tall',dev:'fridge',a:'D',b:'A',x:0,w:600,hinge:'right'}]).F, F2=lay([{id:1,kind:'tall',dev:'fridge',a:'D',b:'A',x:0,w:600,hinge:'left'}]).F;
        return !has(F1,/Angel .* an der Wand/) && has(F2,/Angel links an der Wand/); })());
    {
      const K=KX.normKitchen({items:[{id:1,kind:'island',x:2000,y:1500,rot:0,w:1200,d:900}]});
      const L=KX.layout(E,K), pl=KX.planner(E,L);
      const a={x:2000,y:600}, b={x:2000,y:2400}, r=pl.route(a,b);
      chk('kueche: Weg führt um die Insel herum (länger als die Luftlinie, Punkte frei)',
        r.ok && r.len>1800+50 && r.path.length>2 && r.path.every(p=>!TILES.pointInRing(p, L.G[0].poly)));
    }
    {
      // Teller weit weg vom Tisch, Unterschrank neben dem Tisch leer -> Vorschlag
      const K=KX.normKitchen({items:[
        {id:1,kind:'base',dev:'dw',a:'A',b:'B',x:100,w:600},{id:2,kind:'base',a:'A',b:'B',x:700,w:600,store:['besteck']},
        {id:3,kind:'base',a:'B',b:'C',x:2200,w:600,store:['teller']},{id:4,kind:'base',a:'A',b:'B',x:3300,w:600,store:['glaeser']},
        {id:5,kind:'table',x:1200,y:1500,rot:0,w:1200,d:800,seats:4}]});
      const L=KX.layout(E,K), S=KX.suggest(E,K,L,3), f0=KX.flows(E,K,L);
      chk('kueche: Wege werden gezählt (Tisch decken > 0, km/Jahr endlich)', f0.flows.find(f=>f.key==='decken').week>0 && isFinite(f0.kmYear));
      // Bis zum Snack-Ablauf (Messer zählen doppelt) wanderte hier der Teller;
      // jetzt bekommen die Messer die Schublade neben der Spülmaschine und das
      // Besteck rückt weiter. Geprüft bleibt: es gibt echte Umzüge, nicht nur
      // Einräumen, und Messer/Besteck landen nur in Schubladen.
      chk('kueche: Umsortieren schlägt neben dem Einräumen auch Umzüge vor (Messer, Besteck nur in Schubladen)',
        S.some(m=>!m.place) && isFinite(S.kmPlaced) && S.filter(m=>m.c==='messer'||m.c==='besteck').every(m=>KX.frontKind(K.items.find(it=>it.id===m.to))==='drawer'));
      chk('kueche: Einräumen verteilt fehlende Inhalte (Tassen, Töpfe …) und nichts außer Müll/Putz unter die Spüle',
        S.some(m=>m.place) && S.filter(m=>m.place).every(m=>{ const it=K.items.find(i=>i.id===m.to); return KX.storable(it).includes(m.c); }));
      chk('kueche: Besteck nur in Schubladen', S.filter(m=>m.c==='besteck').every(m=>KX.frontKind(K.items.find(i=>i.id===m.to))==='drawer'));
      chk('kueche: unter die Spüle kommen keine Teller', !KX.storable({kind:'base',dev:'sink'}).includes('teller') && KX.storable({kind:'base',dev:'dw'}).length===0);
    }
    // --- Verbesserungslauf ---
    {
      const K=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:1000,w:600}]}), L=KX.layout(E,K), Wf=KX.wallFrame(E,'A','B');
      chk('kueche: Hängeschrank rastet bündig über dem Unterschrank ein', KX.slotCandidates(E,K,L,{id:9,kind:'wall',w:600},Wf).some(x=>near(x,1000,0.5)));
      chk('kueche: Spüle rastet mittig unter dem Fenster ein', KX.slotCandidates(E,K,L,{id:9,kind:'base',dev:'sink',w:600},Wf).some(x=>near(x,1700,0.5)));
      chk('kueche: neben der Tür anschließen', (()=>{ const W2=KX.wallFrame(E,'C','D'); return KX.slotCandidates(E,K,L,{id:9,kind:'base',w:600},W2).some(x=>near(x,1300,0.5)); })());
      chk('kueche: nicht über das Wandende', !KX.fitsAt(E,K,L,{id:9,kind:'base',w:600},Wf,3500));
    }
    {
      // L-Küche mit Eckschrank und Passblende: keine roten Befunde in der Ecke.
      const K=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',a:'A',b:'D',x:0,w:1000},{id:2,kind:'base',a:'A',b:'B',x:630,w:600},{id:3,kind:'base',a:'A',b:'B',x:1230,w:600}]});
      const L=KX.layout(E,K), F=KX.check(E,K,L);
      chk('kueche: L-Ecke mit Eckschrank und Passblende ohne Fehler', !F.some(f=>f.lvl==='bad'));
      chk('kueche: Querplatte läuft bis an die durchlaufende Platte (kein Loch)', L.tops.length===2 && L.tops.some(t=>near(t.s0,600,1)));
      chk('kueche: Eckschrank zeigt eine Blende und eine Tür', KX.envelopes(K,L.byId.get(1)).length===1);
    }
    // --- Ohne Wandbuchstaben (Meldung M-20261109-145224-3ebe3b) ---
    chk('kueche: Befunde nennen keine Wandbuchstaben', (()=>{ const {F}=lay([{id:1,kind:'wall',a:'A',b:'B',x:1600,w:600},{id:2,kind:'base',a:'A',b:'B',x:0,w:600},{id:3,kind:'base',a:'A',b:'B',x:640,w:600},{id:4,kind:'base',a:'C',b:'D',x:500,w:600}]);
      return F.length>2 && F.every(f=>!/\b[A-Z]{1,2}–[A-Z]{1,2}\b/.test(f.txt)); })());
    // --- Eckschrank-Konfigurator (Meldung M-20261109-134919-c2a193) ---
    {
      const row=[{id:2,kind:'base',a:'A',b:'B',x:630,w:600},{id:3,kind:'base',a:'A',b:'B',x:1230,w:600}];
      // nobilia UE100-50: Blende 500 hinter der 580 tiefen Querzeile + 50 Passblende -> 130 von der Ecke
      const ue={id:1,kind:'base',corner:true,front:'door',door:500,inner:'schub',a:'A',b:'D',x:0,w:1000};
      const K=KX.normKitchen({items:[ue,...row]}), L=KX.layout(E,K), Wf=KX.wallFrame(E,'A','D');
      const x=KX.cornerPlace(E,K,L,K.items[0],Wf);
      chk('kueche-eck: UE100-50 sitzt 130 mm von der Ecke (Blende hinter Querzeile + Passblende)', near(x,130,0.5));
      const K2=KX.normKitchen({items:[{...ue, x},...row]}), L2=KX.layout(E,K2), F2=KX.check(E,K2,L2), g2=L2.byId.get(1);
      chk('kueche-eck: so gesetzt keine roten Befunde', !F2.some(f=>f.lvl==='bad'));
      chk('kueche-eck: Schubkasten + Tür = Auszug oben und Tür', (()=>{ const e=KX.envelopes(K2,g2); return e.length===2 && e[0].what==='Auszug' && e[1].what==='Tür' && e[0].z0>=e[1].z1-1; })());
      chk('kueche-eck: Typname nach nobilia', KX.cornerType(K2.items[0])==='UE100-50' && KX.cornerType({kind:'wall',corner:true,w:782,door:350})==='WE80-35');
      chk('kueche-eck: Stückliste nennt Typ und Innenleben', KX.stock(K2,L2).list.some(r=>/UE100-50/.test(r.extra) && /Schubkasten/.test(r.extra)));
      // passend: Blende folgt der tatsächlichen Querzeile (400 tief -> 450)
      const K3=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',a:'A',b:'D',x:0,w:1000},{id:2,kind:'base',a:'A',b:'B',x:450,w:600,d:400}]}), L3=KX.layout(E,K3);
      chk('kueche-eck: Blende „passend“ nimmt die Tiefe der Querzeile', near(KX.cornerBlind(L3.byId.get(1),K3.spec).b,450,0.5));
      // Ecke fest: cEnd überlebt das Umdrehen in den kanonischen Wandrahmen
      const K4=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',cEnd:0,a:'D',b:'A',x:0,w:1000}]}); KX.layout(E,K4);
      chk('kueche-eck: Ecke bleibt beim Umdrehen des Wandrahmens dieselbe', K4.items[0].a==='A' && K4.items[0].cEnd===1 && near(K4.items[0].x,2000,0.5));
      const n=KX.normItem({id:1,kind:'wall',corner:true,door:350,inner:'quatsch',cEnd:1,a:'A',b:'B',x:0,w:782});
      chk('kueche-eck: Hänge-Eckschrank bleibt beim Laden erhalten (Tür, Ecke; Unsinn weg)', n.corner===true && n.door===350 && n.cEnd===1 && !('inner' in n));
    }
    {
      // Hänge-Eckschrank WE80-35 über Eck mit Hängeschrankzeile an A–B
      const items=[{id:1,kind:'wall',corner:true,front:'door',door:350,a:'A',b:'D',x:0,w:782},{id:2,kind:'wall',a:'A',b:'B',x:420,w:600}];
      const K=KX.normKitchen({items}), L=KX.layout(E,K), g=L.byId.get(1), cb=KX.cornerBlind(g,K.spec);
      chk('kueche-eck: Hänge-Eckschrank hat Blende 432 zur Ecke A', cb && near(cb.b,432,0.5) && cb.atS0);
      const env=KX.envelopes(K,g);
      chk('kueche-eck: Hänge-Eckschrank – Tür in Hängeschrankhöhe', env.length===1 && env[0].what==='Tür' && env[0].z0>=g.z0-1 && env[0].z1<=g.z1+1);
      chk('kueche-eck: Hänge-Eckschrank über Eck ohne rote Befunde', !KX.check(E,K,L).some(f=>f.lvl==='bad'));
      const F=lay([{id:1,kind:'wall',a:'A',b:'D',x:0,w:600},{id:2,kind:'wall',a:'A',b:'B',x:420,w:600}]).F;
      chk('kueche-eck: Hängeschränke über Eck – Abhilfe „Als Eckhängeschrank“', F.some(f=>f.fix && f.fix.set.corner && /Eckhängeschrank/.test(f.fix.label)));
    }
    {
      // Über Eck (L) 90×90 in Ecke A an A–D, Zeile an A–B ab 900
      const Lk={id:1,kind:'base',corner:true,ctype:'L',inner:'karussell',front:'door',cEnd:0,a:'A',b:'D',x:0,w:900};
      const row=[{id:2,kind:'base',a:'A',b:'B',x:900,w:600},{id:3,kind:'base',a:'A',b:'B',x:1500,w:600}];
      const K=KX.normKitchen({items:[Lk,...row]}), L=KX.layout(E,K), g=L.byId.get(1), wg=L.G.find(h=>h.wing);
      chk('kueche-eck: L-Eck bekommt den zweiten Schenkel an A–B (580…900)', !!wg && wg.it.id===1 && wg.Wf.key==='A|B' && near(wg.vs0,580,0.5) && near(wg.vs1,900,0.5) && near(wg.s0,0,0.5) && L.byId.get(1)===g);
      chk('kueche-eck: L-Eck – Umriss L, zwei Türen im Eckfeld', g.outline.length===6 && g.env.length===2 && g.env.every(e=>e.what==='Tür' && near(e.r,320,0.5)));
      chk('kueche-eck: L-Eck in der L-Küche ohne rote Befunde', !KX.check(E,K,L).some(f=>f.lvl==='bad'));
      chk('kueche-eck: Platte deckt den zweiten Schenkel', L.tops.some(t=>TILES.pointInRing({x:750,y:300},t.poly)) && L.tops.some(t=>TILES.pointInRing({x:300,y:750},t.poly)));
      chk('kueche-eck: neben dem zweiten Schenkel ist besetzt', !KX.fitsAt(E,K,L,{id:9,kind:'base',w:300},KX.wallFrame(E,'A','B'),600));
      chk('kueche-eck: Stückliste – ein Eintrag, Typ UEK90 Karussell', KX.stock(K,L).list.filter(r=>/Eckschrank/.test(r.name)).length===1 && KX.stock(K,L).list.some(r=>/UEK90/.test(r.extra) && /Karussell/.test(r.extra)));
      chk('kueche-eck: Karussell und Bauart bleiben beim Laden', (()=>{ const n=KX.normItem(Lk); return n.ctype==='L' && n.inner==='karussell' && !('door' in n); })());
      // nicht in der Ecke: roter Befund mit Abhilfe
      const F2=lay([{...Lk, x:500}]).F, f2=F2.find(f=>/Innenecke/.test(f.txt));
      chk('kueche-eck: L-Eck nicht in der Ecke – gemeldet, Abhilfe „In die Ecke“', !!f2 && f2.lvl==='bad' && f2.fix && near(f2.fix.set.x,0,0.5));
      // Diagonal: Fünfeck, eine Tür auf der Schräge (≈ 452 mm bei 90/58)
      const Kd=KX.normKitchen({items:[{...Lk, ctype:'diag', inner:undefined, hinge:'left'}]}), Ld=KX.layout(Kd.items.length?E:E,Kd), gd=Ld.byId.get(1);
      chk('kueche-eck: Diagonal – Fünfeck als Grundfläche, eine Tür auf der Schräge', gd.foot && gd.foot.length===5 && TILES.pointInRing({x:600,y:600},gd.foot) && gd.env.length===1 && near(gd.env[0].r,Math.SQRT2*320,1));
      chk('kueche-eck: Diagonal – Typ UED90', KX.cornerType(Kd.items[0])==='UED90');
      chk('kueche-eck: Diagonal – Platte deckt das Dreieck vor dem Eckfeld, Stückliste ohne Eckstück', Ld.tops.some(t=>TILES.pointInRing({x:650,y:650},t.poly)) && KX.stock(Kd,Ld).tops.every(t=>t.len>0));
      // Hänge-Eckschrank über Eck 60×60: zweiter Schenkel ab Tiefe oben
      const Kw=KX.normKitchen({items:[{id:1,kind:'wall',corner:true,ctype:'L',front:'door',cEnd:0,a:'A',b:'D',x:0,w:600}]}), Lw=KX.layout(E,Kw), ww=Lw.G.find(h=>h.wing);
      chk('kueche-eck: Hänge-Eckschrank über Eck – Schenkel 370…600 an A–B', !!ww && near(ww.vs0,370,0.5) && near(ww.vs1,600,0.5) && KX.cornerType(Kw.items[0])==='WE60');
      // Wandrahmen umgedreht: Ecke und Schenkel bleiben
      const Kf=KX.normKitchen({items:[{...Lk, a:'D', b:'A', x:2100, cEnd:1}]}), Lf=KX.layout(E,Kf);
      // Maßkette an der Nachbarwand: der Schenkel zählt bis in die Ecke, und
      // der Block mit ihm ist nicht per Eingabefeld verschiebbar.
      const cd=KX.chainDims(E,L,L.byId.get(3));
      chk('kueche-eck: Maßkette A–B – Schenkel bis in die Ecke, Block mit Schenkel ohne Eingabefeld', cd && !cd.segs[0].gap && cd.segs.every(sg=>!(sg.edit && sg.edit.ids && sg.edit.ids.includes(1))));
      chk('kueche-eck: L-Eck übersteht das Umdrehen des Wandrahmens', Kf.items[0].cEnd===0 && near(Kf.items[0].x,0,0.5) && Lf.G.some(h=>h.wing));
    }
    {
      const F=lay([{id:1,kind:'base',dev:'hob',a:'A',b:'B',x:0,w:600},{id:2,kind:'wall',a:'A',b:'B',x:0,w:600}]).F;
      const f=F.find(x=>/Dunstabzug/.test(x.txt));
      chk('kueche: Hängeschrank über dem Kochfeld – Abhilfe „Als Dunstabzug“', f && f.fix && f.fix.set.dev==='hood');
      chk('kueche: Dunstabzug in Standardhöhe über dem Kochfeld ist in Ordnung', !has(lay([{id:1,kind:'base',dev:'hob',a:'A',b:'B',x:0,w:600},{id:2,kind:'wall',dev:'hood',a:'A',b:'B',x:0,w:600}]).F, /Dunstabzug|Kochfeld/, 'bad'));
      const K=KX.normKitchen({spec:{baseH:870}, items:[{id:1,kind:'base',a:'A',b:'B',x:0,w:600},{id:2,kind:'wall',a:'A',b:'B',x:0,w:600}]});
      chk('kueche: zu tiefer Hängeschrank über der Platte wird gemeldet', KX.check(E,K,KX.layout(E,K)).some(f=>/über der Arbeitsplatte/.test(f.txt) && f.lvl==='bad'));
    }
    {
      const {L,F}=lay([{id:1,kind:'base',a:'A',b:'B',x:0,w:600},{id:2,kind:'base',a:'A',b:'B',x:640,w:600}]);
      chk('kueche: 40 mm Lücke – eine Platte, Passleiste gemeldet', L.tops.length===1 && F.some(f=>/Passleiste 40 mm/.test(f.txt)));
      const r=KX.flows(E,KX.normKitchen({items:[{id:1,kind:'base',dev:'dw',a:'A',b:'B',x:0,w:600},{id:2,kind:'base',dev:'sink',a:'A',b:'B',x:600,w:600,store:['muell']}]}), KX.layout(E,KX.normKitchen({items:[{id:1,kind:'base',dev:'dw',a:'A',b:'B',x:0,w:600},{id:2,kind:'base',dev:'sink',a:'A',b:'B',x:600,w:600,store:['muell']}]})));
      chk('kueche: Abräumen ohne Tisch zählt nicht halb', r.flows.find(f=>f.key==='abraeumen').week===0);
    }
    // --- Gegenprüfung Verbesserungslauf ---
    {
      // U-Küche: lange Zeile A–B bis Ecke B, Eckschrank in Ecke A – kein Loch in der Platte
      const K=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',a:'A',b:'D',x:0,w:1000},
        {id:2,kind:'base',a:'A',b:'B',x:630,w:600},{id:3,kind:'base',a:'A',b:'B',x:1230,w:600},{id:4,kind:'base',a:'A',b:'B',x:1830,w:600},{id:5,kind:'base',a:'A',b:'B',x:2430,w:600},{id:6,kind:'base',a:'A',b:'B',x:3030,w:600},{id:7,kind:'base',a:'A',b:'B',x:3400,w:600}]});
      const L=KX.layout(E,K);
      chk('kueche: U-/L-Ecke mit Passblende – Platte ohne Loch', L.tops.some(t=>TILES.pointInRing({x:615,y:300},t.poly)));
    }
    {
      const K=KX.normKitchen({items:[{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:0,w:600,store:['muell']},{id:7,kind:'base',a:'C',b:'D',x:2000,w:800,store:['putz']},
        {id:3,kind:'base',dev:'dw',a:'A',b:'B',x:600,w:600},{id:5,kind:'table',x:1500,y:2000,rot:0,w:1200,d:800,seats:4}]});
      const S=KX.suggest(E,K,KX.layout(E,K),3);
      chk('kueche: Müll bleibt an der Spüle (auch beim Tausch)', !S.some(m=>m.c==='muell' && m.to!==1));
    }
    {
      const F=lay([{id:1,kind:'tall',a:'A',b:'D',x:0,w:600},{id:2,kind:'base',a:'A',b:'B',x:630,w:600}]).F;
      chk('kueche: „Als Eckschrank“ nicht für Hochschränke', !F.some(f=>f.fix && f.fix.id===1 && f.fix.set.corner));
      const F2=lay([{id:1,kind:'base',corner:true,front:'drawer',a:'A',b:'D',x:0,w:1000},{id:2,kind:'base',a:'A',b:'B',x:630,w:600}]).F;
      chk('kueche: Eckschrank mit Schubladen – verdeckte Auszüge gemeldet', F2.some(f=>f.lvl==='bad' && /Auszüge/.test(f.txt)));
      const F3=lay([{id:1,kind:'base',dev:'hob',a:'A',b:'B',x:0,w:600},{id:2,kind:'wall',dev:'hood',a:'A',b:'B',x:300,w:600}]).F;
      chk('kueche: Dunstabzug neben der Kochfeldmitte wird gemeldet', F3.some(f=>/neben der Kochfeldmitte/.test(f.txt)));
    }
    // --- Befunde aus dem Review (Regression) ---
    {
      // Leicht schiefer, echter Raum: leere Wand muss Platz bieten, nahe der Ecke.
      const pts=[{id:'A',x:16.86,y:-8.39},{id:'B',x:3982.63,y:-10.12},{id:'C',x:3996.42,y:2989.74},{id:'D',x:21.86,y:3002.87}];
      const E5=KX.makeEnv(pts,[['A','B'],['B','C'],['C','D'],['D','A']],[],[]);
      const K=KX.normKitchen({}), L=KX.layout(E5,K), Wf=KX.wallFrame(E5,'A','B');
      const x=KX.freeSlot(E5,K,L,{id:9,kind:'base',w:600},Wf);
      chk('kueche: schiefer Raum – leere Wand hat Platz, erster Schrank an der Ecke', x!=null && x<20);
      const K2=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:600,w:600},{id:2,kind:'base',a:'A',b:'B',x:1800,w:600}]});
      chk('kueche: schiefer Raum – bündig an der Wand ragt nichts aus dem Raum', !KX.check(E5,K2,KX.layout(E5,K2)).some(f=>/ragt aus dem Raum/.test(f.txt)));
    }
    {
      // Gleiche Wand, einmal A->B, einmal B->A angelegt: eine Platte, ein Rahmen.
      const K=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:0,w:600},{id:2,kind:'base',a:'B',b:'A',x:3400-0,w:600}]});
      // B->A x=3400: liegt bei 3400..4000 ab B, also 0..600 ab A? Nein: 4000-3400-600=0 -> überlappt Teil 1.
      const L=KX.layout(E,K);
      chk('kueche: vertauschte Wandrichtung wird kanonisch (gleiche Lage, gleicher Rahmen)', K.items[1].a==='A' && K.items[1].x===0 && L.G[0].Wf.key===L.G[1].Wf.key);
      const K3=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:0,w:600},{id:2,kind:'base',a:'B',b:'A',x:2800,w:600}]});
      const L3=KX.layout(E,K3);
      chk('kueche: zwei aneinanderstoßende Schränke, verschieden angelegt – eine Platte', L3.tops.length===1 && near(L3.tops[0].len,1200,1));
    }
    {
      const F=lay([{id:1,kind:'tall',dev:'fridge',a:'B',b:'C',x:1000,w:600,hinge:'left'},{id:2,kind:'base',a:'B',b:'C',x:1600,w:1200},{id:3,kind:'base',a:'B',b:'C',x:-200+600,w:600}]).F;
      chk('kueche: Kühlschrank mit Platte an der Griffseite – keine Abstellflächen-Meldung', !has(F,/neben dem Griff keine Abstellfläche/));
    }
    chk('kueche: Hängeschrank über der Tür ist kein Hindernis',
      !has(lay([{id:1,kind:'wall',a:'C',b:'D',x:500,w:600,z:2100,h:360}]).F, /Tür/));
    chk('kueche: Unterschrank auf der Nachbarwand vor der Tür wird gemeldet',
      (()=>{ const d2={...door, x:0, w:900}; const E6=KX.makeEnv(R.pts,R.walls,[d2],[]); const K=KX.normKitchen({items:[{id:1,kind:'base',a:'B',b:'C',x:2420,w:580}]}); return KX.check(E6,K,KX.layout(E6,K)).some(f=>/vor einer Tür/.test(f.txt)); })());
    chk('kueche: Auszüge in der Ecke hinter der Querzeile – geht nicht',
      (()=>{ const K=KX.normKitchen({items:[{id:1,kind:'base',a:'D',b:'A',x:2000,w:1000,front:'drawer'},{id:2,kind:'base',a:'A',b:'B',x:580,w:600}]}); return KX.check(E,K,KX.layout(E,K)).some(f=>f.lvl==='bad' && /Schubladen gehen nicht auf/.test(f.txt)); })());
    chk('kueche: Tisch bündig an der Wand – dort keine Plätze, kein Stuhlraum-Befund',
      (()=>{ const r=lay([{id:1,kind:'table',x:2000,y:400,rot:0,w:1200,d:800}]), g=r.L.G[0], sd=KX.tableSides(g,E,r.L);
        return !has(r.F, /hinter den Stühlen/) && sd.filter(s=>!s.open).length===1 && KX.tableSeats(g,E,r.L)===3; })());
    chk('kueche: Tisch 600 mm vor der Wand – Stuhlraum zu knapp wird gemeldet',
      has(lay([{id:1,kind:'table',x:2000,y:1000,rot:0,w:1200,d:800}]).F, /hinter den Stühlen nur 600 mm/, 'bad'));
    chk('kueche: Plätze aus den Maßen (120×80: 4, 160×90: 6, 340×120: 12, 140×80: 4, 200×100: 6)',
      [[1200,800,4],[1600,900,6],[3400,1200,12],[1400,800,4],[2000,1000,6]].every(([w,d,n])=>{ const p=KX.seatPlan(w,d); return 2*p.long+2*p.end===n; }));
    chk('kueche: Drehung rastet an 0/90° und an einer schiefen Wand ein, sonst frei',
      (()=>{ const a=KX.snapRot(E, 92), b=KX.snapRot(E, 37); 
        const Ek=KX.makeEnv([{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:3500,y:3000},{id:'D',x:0,y:3000}], [['A','B'],['B','C'],['C','D'],['D','A']], [], []);  // B–C schief
        const wa=Math.atan2(3000,-500)*180/Math.PI, c=KX.snapRot(Ek, wa-2);
        const Eq=KX.makeEnv([{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4050,y:3000},{id:'D',x:0,y:3000}], [['A','B'],['B','C'],['C','D'],['D','A']], [], []);  // 1° schief = Rauschen
        return a.rot===90 && b.rot===37 && b.how===null && Math.abs(c.rot-wa)<1e-6 && /Wand/.test(c.how) && KX.snapRot(Eq, 88.5).rot===90; })());
    {
      // Wandversatz wie in Meldung ffeecf: Zeile an C–D, der Raum geht hinter D
      // (Ecke im Raum) noch 1500 mm weiter bis zur Wand F–A.
      const pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000},{id:'D',x:1500,y:3000},{id:'E',x:1500,y:3200},{id:'F',x:0,y:3200}];
      const Ej=KX.makeEnv(pts,[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A']],[],[]);
      const K=KX.normKitchen({items:[{id:1,kind:'base',a:'C',b:'D',x:500,w:600},{id:2,kind:'base',a:'C',b:'D',x:1100,w:600}]});
      const L=KX.layout(Ej,K), D=KX.chainDims(Ej,L,L.byId.get(1));
      const last=D.segs[D.segs.length-1], first=D.segs[0];
      chk('kueche: Maßkette läuft über den Wandversatz bis zur Wand (4000 statt 2500)', near(D.x1,4000,1) && near(D.x0,0,1) && near(last.b-last.a,2300,1));
      chk('kueche: Wandabstände sind editierbar, der Block (2 Schränke) zieht mit',
        first.edit && last.edit && last.edit.ids.length===2 && near(first.edit.cur,500,1));
      KX.applyDim(Ej,K,last.edit,2000);
      chk('kueche: Wandabstand 2000 setzen schiebt beide Schränke um 300 Richtung D', K.items[0].x===800 && K.items[1].x===1400);
      chk('kueche: Wandabstand außerhalb der Grenzen wird abgelehnt', !KX.applyDim(Ej,K,first.edit,-10) && !KX.applyDim(Ej,K,last.edit,99999));
      const K2=KX.normKitchen({items:[{id:1,kind:'island',x:2000,y:1500,rot:0,w:1800,d:900}]}), L2=KX.layout(E,K2);
      const fd=KX.freeDims(E,L2,L2.byId.get(1));
      const right=fd.find(d=>d.n.x>0.9);
      chk('kueche: Insel zeigt vier Wandabstände', fd.length===4 && near(right.val,4000-2900,2));
      KX.applyDim(E,K2,right.edit,500);
      const fd2=KX.freeDims(E,KX.layout(E,K2),KX.layout(E,K2).byId.get(1));
      chk('kueche: Inselabstand rechts auf 500 setzen verschiebt sie', near(fd2.find(d=>d.n.x>0.9).val,500,2));
    }
    {
      // Insel quer zur Wand A–B (oben, y=0), Stirnseite 100 mm davor, 10° schief:
      // dockt bündig an, steht danach exakt senkrecht.
      const K=KX.normKitchen({items:[{id:1,kind:'island',x:2000,y:1000,rot:80,w:1800,d:900}]}), it=K.items[0];
      const dk=KX.dockFree(E,K,it,200);
      const g2=dk && KX.geom(E,K,{...it,x:dk.x,y:dk.y,rot:dk.rot});
      chk('kueche: Insel dockt mit der Stirnseite bündig an die Wand, quer dazu',
        dk && !/[A-Z]–[A-Z]/.test(dk.wall) && Math.abs(Math.abs(g2.u.y)-1)<1e-9 && Math.min(...g2.poly.map(p=>p.y))>-0.5 && Math.min(...g2.poly.map(p=>p.y))<0.5);
      chk('kueche: Insel längs zur Wand dockt nicht an', KX.dockFree(E,KX.normKitchen({items:[{id:1,kind:'island',x:2000,y:500,rot:0,w:1800,d:900}]}),{id:1,kind:'island',x:2000,y:500,rot:0,w:1800,d:900},200)===null);
      const Kd={...K, items:[{...it, x:dk.x, y:dk.y, rot:dk.rot}]}, Ld=KX.layout(E,KX.normKitchen(Kd));
      chk('kueche: angedockte Insel ragt nicht aus dem Raum', !KX.check(E,KX.normKitchen(Kd),Ld).some(f=>/ragt aus dem Raum|überlappen/.test(f.txt)));
      const r=lay([{id:1,kind:'island',x:2000,y:1500,rot:0,w:1800,d:900,bar:381}]), g=r.L.byId.get(1);
      chk('kueche: Tresen – Platte 381 mm Überstand hinten, 2 Hocker, Platte im Plan', g.foot && near(Math.abs(TILES.polyArea(g.foot)),1800*1281,1) && KX.barSeats(g)===2 && r.L.tops.find(t=>t.island).depth===1281);
      chk('kueche: Tresen – NKBA-Knieraum nach Höhe (Tisch 457, Theke 381, Bar 305)', KX.barNkba(750)===457 && KX.barNkba(910)===381 && KX.barNkba(1070)===305);
      chk('kueche: Kühlschranktür schlägt an den Tresen-Überstand (nicht an den Korpus)',
        (()=>{ const it=[{id:2,kind:'tall',dev:'fridge',a:'A',b:'B',x:1700,w:600,hinge:'left'}];
          const isl=bar=>({id:1,kind:'island',x:2000,y:1980,rot:0,w:1800,d:900,...(bar?{bar:500}:{})});
          return !has(lay([...it, isl(0)]).F, /Tür von Kühlschrank.*stößt an Insel/) && has(lay([...it, isl(1)]).F, /Tür von Kühlschrank.*stößt an Insel/); })());
      chk('kueche: Tresen nahe der Wand – zu wenig Platz hinter den Hockern', has(lay([{id:1,kind:'island',x:2000,y:1200,rot:0,w:1800,d:900,bar:381}]).F, /hinter den Hockern nur/, 'bad'));
    }
    chk('kueche: alte gespeicherte Platzzahl wird ignoriert',
      KX.normKitchen({items:[{id:1,kind:'table',x:0,y:0,w:1200,d:800,seats:10}]}).items[0].seats===undefined);
    {
      const K=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:1000,w:2400},{id:2,kind:'wall',a:'A',b:'B',x:1000,w:600,store:['teller']},{id:3,kind:'table',x:2000,y:2000,rot:0,w:1200,d:800,seats:4}]});
      const L=KX.layout(E,K), r=KX.flows(E,K,L);
      chk('kueche: Weg vom Hängeschrank über der Zeile ist begehbar (nicht gesperrt)', r.flows.find(f=>f.key==='decken').legs.every(l=>l.ok));
      const K2=KX.normKitchen({items:[{id:1,kind:'island',x:2000,y:1500,rot:0,w:2400,d:900},{id:2,kind:'base',a:'A',b:'B',x:1700,w:600,dev:'sink'},{id:3,kind:'base',a:'C',b:'D',x:1700,w:600,dev:'hob'}]});
      const L2=KX.layout(E,K2), r2=KX.flows(E,K2,L2), leg=r2.flows.find(f=>f.key==='kochen').legs.find(l=>(l.from==='sink'&&l.to==='hob')||(l.from==='hob'&&l.to==='sink'));
      chk('kueche: Weg Spüle–Herd geht um die Insel, nicht hindurch', !leg || (leg.ok && leg.path.length>2));
    }
    chk('kueche: gleiche Meldung für mehrere Teile behält alle Teile',
      (()=>{ const F=lay([{id:1,kind:'wall',a:'A',b:'B',x:1500,w:500},{id:2,kind:'wall',a:'A',b:'B',x:2000,w:500}]).F; const f=F.find(x=>/Fensterflügel A–B schlägt an Hängeschrank 50/.test(x.txt)); return !f || f.ids.length>=1; })());
    {
      const {K,L}=lay([{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:1700,w:600},{id:2,kind:'tall',dev:'fridge',a:'D',b:'A',x:0,w:600}]);
      const S=KX.scene(E,K,L,{}), Wf=KX.wallFaces(E);
      chk('kueche: 3D-Szene hat Prismen für Korpus, Fronten, Platte, Armatur', S.prisms.length>=8 && S.glass.length===1);
      chk('kueche: Wandflächen sparen Fenster und Tür aus (mehr Streifen als Wände)', Wf.quads.length>=4+3 && Wf.caps.length===4);
      {
        // Säule im Raum: voller Deckel statt Streifen, sonst sieht man in 3D
        // durch die Säule hindurch (Meldung M-20261109-135945-ad27b6).
        const Q=[['A',0,0],['B',6000,0],['C',6000,4000],['D',0,4000],['I',2800,1800],['J',3200,1800],['K',3200,2200],['L',2800,2200]].map(([id,x,y])=>({id,x,y}));
        const EQ=KX.makeEnv(Q,[['A','B'],['B','C'],['C','D'],['D','A'],['I','J'],['J','K'],['K','L'],['L','I']],[],[]), WQ=EQ && KX.wallFaces(EQ);
        chk('kueche: Säule bekommt in 3D einen geschlossenen Deckel, keine Randstreifen',
          !!WQ && WQ.tops.length===1 && WQ.tops[0].length===4 && WQ.caps.length===4 && WQ.tops[0].every(p=>p.z>2000));
      }
      chk('kueche: offene Fronten in 3D (Kühlschranktür steht 90° ab)',
        KX.scene(E,K,L,{open:true}).prisms.some(p=>p.id===2 && Math.abs(p.poly[1].x-p.poly[0].x)>500));
    }
    // --- Einbau-Kühlschrank: Tür 90° oder 120° (Meldung M-20261109-135752-e60089) ---
    {
      const fr=(hinge,swing)=>lay([{id:1,kind:'tall',dev:'fridge',a:'A',b:'B',x:0,w:600,hinge,swing}]);
      const w120=['left','right'].map(hg=>fr(hg,120).F.some(f=>/geht keine 120° auf/.test(f.txt)));
      const w90=['left','right'].map(hg=>fr(hg,90).F.some(f=>/geht keine 90° auf/.test(f.txt)));
      chk('kueche: Kühlschrank in der Ecke – 120° stößt mit der Angel zur Ecke an die Wand, 90° nicht',
        w120.filter(Boolean).length===1 && !w90.some(Boolean));
      const hg=w120[0]?'left':'right', f=fr(hg,120).F.find(x=>/geht keine 120° auf/.test(x.txt));
      chk('kueche: Abhilfe „Nur 90° einplanen“ wird angeboten', !!f && f.fix && f.fix.set.swing===90);
      chk('kueche: Schwenkbereich 120° ist größer als 90°',
        (()=>{ const e9=fr('left',90).L.G[0].env[0], e12=fr('left',120).L.G[0].env[0]; return e9.deg===90 && e12.deg===120 && e12.poly.length>e9.poly.length; })());
      chk('kueche: Öffnungswinkel nur 90/120, nur beim Einbau-Kühlschrank',
        (()=>{ const n=KX.normKitchen({items:[{id:1,kind:'tall',dev:'fridge',a:'A',b:'B',x:0,w:600,swing:120},{id:2,kind:'tall',dev:'fridge',a:'A',b:'B',x:700,w:600,swing:100},{id:3,kind:'tall',dev:'fridge',fz:'fd',a:'A',b:'B',x:1400,w:900,swing:120},{id:4,kind:'tall',a:'A',b:'B',x:2400,w:600,swing:120}]}).items;
          return n[0].swing===120 && n[1].swing==null && n[2].swing==null && n[3].swing==null && KX.swingOf(n[1])===90; })());
      chk('kueche: neuer Kühlschrank aus der Leiste geht 120° auf', KX.PRESETS.find(p=>p.key==='fridge').swing===120);
    }
    // --- Frei stehende Kühlschränke: French Door, Side by Side (Meldung M-20261109-133140-d316bb) ---
    {
      const n=KX.normKitchen({items:[
        {id:1,kind:'tall',dev:'fridge',fz:'sbs',doorT:500,a:'A',b:'B',x:0,w:910},
        {id:2,kind:'tall',dev:'fridge',fz:'quatsch',a:'A',b:'B',x:1000,w:600},
        {id:3,kind:'tall',fz:'fd',a:'A',b:'B',x:2000,w:600},
        {id:4,kind:'tall',dev:'fridge',a:'A',b:'B',x:0,w:860,front:'door',hinge:'right',store:['kuehl']}]}).items;
      chk('kueche: Bauform und Türdicke werden gelesen (Türdicke begrenzt, unbekannte Bauform und Bauform ohne Kühlschrank fallen weg)',
        n[0].fz==='sbs' && n[0].doorT===KX.DOORT_LIM[1] && !('fz' in n[1]) && !('fz' in n[2]) && !('doorT' in n[1]));
      chk('kueche: alter Kühlschrank (86 cm, Anschlag rechts) lädt unverändert – eine Tür, kein Flügelpaar',
        (()=>{ const it=n[3], {L}=lay([it]), env=L.G[0].env;
          return !('fz' in it) && it.w===860 && it.hinge==='right' && env.length===1 && env[0].what==='Tür' && !env[0].leaf && Math.abs(env[0].r-860)<1; })());
      const d2r=Math.PI/180;
      chk('kueche: Flügelmodell trifft die Bosch-Maßblätter (KFF96PIEP 90° → 45, 118° → 268; KAN93VIFP 130° → 277, 135° → 418; ohne Griff bis 30 mm darunter)',
        Math.abs(KX.leafReachSide({W:452,t:96},90*d2r)-45)<=5 && Math.abs(KX.leafReachSide({W:452,t:96},118*d2r)-268)<=20
        && Math.abs(KX.leafReachSide({W:387,t:79},130*d2r)-277)<=5 && Math.abs(KX.leafReachSide({W:515,t:79},135*d2r)-418)<=30);
      const fd=x=>({id:1,kind:'tall',dev:'fridge',fz:'fd',a:'B',b:'C',x,w:900});
      {
        const {L}=lay([fd(1000)]), lv=KX.leaves(L.G[0]);
        chk('kueche: French Door hat zwei gleiche Flügel, Angeln außen', lv.length===2 && Math.abs(lv[0].W-450)<1 && Math.abs(lv[1].W-450)<1
          && Math.abs(Math.hypot(lv[0].P.x-lv[1].P.x, lv[0].P.y-lv[1].P.y)-900)<1 && L.G[0].env.filter(e=>e.leaf).length===2 && L.G[0].env.some(e=>e.what==='Auszug'));
        const {L:L2}=lay([{...fd(1000), fz:'sbs', w:910}]), l2=KX.leaves(L2.G[0]);
        chk('kueche: Side by Side: Gefrierteil schmaler als Kühlteil (Bosch 387/515)', Math.abs(l2[0].W/910-0.43)<0.01 && l2[1].W>l2[0].W);
      }
      // Zwischen 58er Unterschränken mit 3 mm Luft (Bosch: A ≤ 600 → 3 mm): alles frei.
      const between=[{id:2,kind:'base',a:'B',b:'C',x:397,w:600},fd(1000),{id:3,kind:'base',a:'B',b:'C',x:1903,w:600}];
      chk('kueche: French Door zwischen Unterschränken mit 3 mm Luft – kein Flügelbefund',
        !has(lay(between).F, /Flügel/));
      chk('kueche: French Door bündig an der Seitenwand – Flügel geht nicht auf (bad)',
        has(lay([fd(0)]).F, /linker Flügel: geht nur 0° auf, die Wand/, 'bad') || has(lay([fd(0)]).F, /rechter Flügel: geht nur 0° auf, die Wand/, 'bad'));
      chk('kueche: 100 mm neben der Wand – 90° ja, ganz offen nein (warn, nicht bad)',
        (()=>{ const F=lay([fd(100)]).F; return has(F,/Flügel: geht \d+° auf, nicht ganz \(118°\) – die Wand/, 'warn') && !has(F,/Flügel: geht nur/); })());
      // Freistehend (Meldung M-20261109-140322-42075e): eine Tür, Anschlag wählbar,
      // Kühlschrank wahlweise mit Gefrierteil; dazu Gefrierschrank und Mikrowelle.
      chk('kueche: freistehender Kühlschrank – eine Tür über die ganze Breite, mit Gefrierteil zwei übereinander',
        (()=>{ const one=lay([{id:1,kind:'tall',dev:'fridge',fz:'free',hinge:'left',a:'B',b:'C',x:500,w:600}]).L.G[0].env.filter(e=>e.leaf);
          const two=lay([{id:1,kind:'tall',dev:'fridge',fz:'free',gf:true,a:'B',b:'C',x:500,w:600}]).L.G[0].env.filter(e=>e.leaf);
          return one.length===1 && Math.abs(one[0].leaf.W-600)<1 && two.length===2 && two[0].z0>two[1].z1 && two.every(e=>e.leaf.full===115); })());
      chk('kueche: freistehend frei vor der Wand geht ganz auf (115°, ungerade) – keine „null ist im Weg“-Meldung',
        !lay([{id:1,kind:'tall',dev:'fridge',fz:'free',hinge:'left',a:'B',b:'C',x:800,w:600}]).F.some(f=>/null/.test(f.txt) || /Tür: geht/.test(f.txt)));
      chk('kueche: Gefrierteil und Bauform werden gelesen; French Door am Gefrierschrank und Gefrierteil am Gefrierschrank fallen weg',
        (()=>{ const n=KX.normKitchen({items:[{id:1,kind:'tall',dev:'freezer',fz:'free',gf:true,a:'A',b:'B',x:0,w:600},
          {id:2,kind:'tall',dev:'freezer',fz:'fd',swing:120,a:'A',b:'B',x:700,w:900},{id:3,kind:'tall',dev:'fridge',fz:'free',gf:true,a:'A',b:'B',x:1700,w:600}]}).items;
          return n[0].fz==='free' && !('gf' in n[0]) && !('fz' in n[1]) && n[1].swing===120 && n[2].gf===true; })());
      chk('kueche: Mikrowelle im Hochschrank – 3D mit dunkler Gerätefront zwischen zwei Türen; Gefrierschrank frei mit einer Tür',
        (()=>{ const {K,L}=lay([{id:1,kind:'tall',dev:'mw',a:'B',b:'C',x:500,w:600}]), g=L.G[0], fr=KX.frontsOf(g, 150, g.z1, L.D, K.spec);
          const fz=lay([{id:1,kind:'tall',dev:'freezer',fz:'free',a:'B',b:'C',x:500,w:600}]);
          return fr.length===3 && fr.filter(f=>f.oven).length===1 && KX.scene(E,K,L,{}).prisms.length>0
            && fz.L.G[0].env.filter(e=>e.leaf).length===1 && KX.nameOf(fz.K.items[0])==='Gefrierschrank frei 60'; })());
      // Bewusst geändert: die Mikrowelle sitzt im Hochschrank, darüber und
      // darunter sind Fächer (Hochschrank-Geräte wie die hohe Spülmaschine).
      chk('kueche: Mikrowelle im Hochschrank trägt Inhalte in den Fächern, Gefrierschrank keine; Name Kühl-Gefrier frei',
        KX.storable({kind:'tall',dev:'mw'}).includes('teller') && KX.storeCap({kind:'tall',dev:'mw'})===2 && KX.storable({kind:'tall',dev:'freezer'}).length===0
        && KX.nameOf({kind:'tall',dev:'fridge',fz:'free',gf:true,w:600})==='Kühl-Gefrier frei 60');
      chk('kueche: Einbau-Gefrierschrank verhält sich wie der Kühlschrank (eine Tür, 120° wählbar, Angel-Prüfung)',
        (()=>{ const r=lay([{id:1,kind:'tall',dev:'freezer',a:'D',b:'A',x:0,w:600,hinge:'right',swing:120}]); const e=r.L.G[0].env;
          return e.length===1 && e[0].deg===120 && KX.swingOf(r.K.items[0])===120; })());
      chk('kueche: Leiste nach kalt/warm/nass/Stauraum/Möbel – jede sichtbare Vorlage hat eine Gruppe, ein Kühlschrank, ein Gefrierschrank',
        KX.PRESETS.filter(p=>p.pal!==false).every(p=>KX.PGROUPS.some(([g])=>g===p.grp))
        && KX.PRESETS.filter(p=>p.pal!==false && p.dev==='fridge').length===1 && KX.PRESETS.filter(p=>p.pal!==false && p.dev==='freezer').length===1);
      chk('kueche: Stauraum in der Leiste nur Schrank, Eckschrank, Insel; Backofen im Hochschrank unter Warm',
        JSON.stringify(KX.PRESETS.filter(p=>p.pal!==false && p.grp==='stau').map(p=>p.key))==='["base","corner","island"]'
        && KX.PRESETS.some(p=>p.key==='oven' && p.pal!==false && p.grp==='warm'));
      chk('kueche: Spülmaschine hoch im Hochschrank – Tür klappt auf Hüfthöhe',
        (()=>{ const r=lay([{id:1,kind:'tall',dev:'dw',a:'D',b:'A',x:0,w:600}]); const e=r.L.G[0].env, S=r.K.spec, D=KX.derived(S);
          const f=e.filter(x=>/Spülmaschinentür/.test(x.what));
          return r.K.items[0].dev==='dw' && f.length===1 && f[0].z0===D.workH-400 && f[0].z0>S.plinth+300
            && KX.nameOf(r.K.items[0])==='Spülmaschine hoch 60'; })());
      // --- Fächer unter und über der hohen Spülmaschine (Meldung M-20261109-161527-05b8cd) ---
      {
        const S=KX.K_DEF, D=KX.derived(S), hi={kind:'tall',dev:'dw',a:'D',b:'A',x:0,w:600}, st=KX.storable(hi,S), Z=KX.dwZones(hi,S);
        chk('kueche: Spülmaschine hoch – Fach unten (Sockel bis Gerät) und oben (Gerät bis Oberkante)',
          Z.length===2 && Z[0].z0===S.plinth && Z[0].z1===KX.devZ(hi,S) && Z[1].z0===KX.devZ(hi,S)+KX.DW_H && Z[1].z1===D.tallTop);
        chk('kueche: Spülmaschine hoch – Vorräte und Geschirr möglich, kein Müll, kein Besteck, keine Messer; unten eingebaut nichts',
          ['vorrat','teller','tassen','glaeser','toepfe'].every(k=>st.includes(k)) && !st.some(k=>['muell','besteck','messer','kuehl'].includes(k))
          && KX.storable({kind:'base',dev:'dw'},S).length===0 && KX.storeCap(hi,S)===2);
        const low={...hi, h:1440}, Zl=KX.dwZones(low,S), stl=KX.storable(low,S);
        chk('kueche: Spülmaschine hoch im niedrigen Hochschrank – nur das Fach unten, nur Untenzeug, keine verkehrte Front',
          Zl.length===1 && KX.storeCap(low,S)===1 && !stl.includes('teller') && stl.includes('vorrat')
          && [1440,1200].every(h=>{ const r=lay([{...hi,id:1,h}]), g=r.L.G[0]; return KX.frontsOf(g,S.plinth,g.z1,D,S).every(f=>f.z1>f.z0 && f.z1<=g.z1); }));
        const K2=KX.normKitchen(JSON.parse(JSON.stringify(KX.normKitchen({items:[{...hi,id:1,store:['vorrat','teller']}]}))));
        chk('kueche: Spülmaschine hoch – Inhalt bleibt nach Speichern/Laden, zählt als Station für die Wege',
          JSON.stringify(K2.items[0].store)==='["vorrat","teller"]'
          && (()=>{ const r=lay([{...hi,id:1,store:['teller']}]); return (KX.stations(E,r.K,r.L).teller||[]).some(x=>x.id===1); })());
        const items=[{id:1,kind:'base',a:'A',b:'B',x:600,w:600,dev:'sink'},{id:2,kind:'tall',dev:'dw',a:'A',b:'B',x:1200,w:600},
          {id:3,kind:'base',a:'A',b:'B',x:1800,w:600,dev:'hob'},{id:4,kind:'base',a:'B',b:'C',x:700,w:600},{id:5,kind:'tall',dev:'fridge',a:'B',b:'C',x:1300,w:600,store:['kuehl']}];
        const r=lay(items), O=KX.optimalStore(E,r.K,r.L), inDw=Object.entries(O.assign).filter(([,ids])=>ids.includes(2)).map(([k])=>k);
        const Sg=KX.suggest(E,r.K,r.L), inDwS=Object.entries(Sg.assign).filter(([,ids])=>ids.includes(2)).map(([k])=>k);
        chk('kueche: optimal einräumen und umsortieren – hohe Spülmaschine je Fach ein Inhalt, unten nur Untenzeug, nie Müll, Besteck oder Messer',
          [inDw, inDwS].every(L=>L.length<=2 && !L.some(k=>['muell','besteck','messer'].includes(k)) && KX.storeFits(r.K.items[1],r.K.spec,L))
          && !KX.storeFits(hi,S,['teller','tassen']) && KX.storeFits(hi,S,['teller','vorrat']) && KX.storeFits(hi,S,['vorrat','toepfe'])
          && !KX.storeFits({...hi,h:1440},S,['teller']));
        const Kt=KX.normKitchen({items:[{...hi,id:1,store:['teller','vorrat']}]}); Kt.spec.tallH=1400; const nT=KX.fitStores(Kt);
        const Kl=KX.normKitchen({spec:{...KX.K_DEF, tallH:1400}, items:[{...hi,id:1,store:['teller','vorrat']}]});
        {
          const r1=lay([{...hi,id:1}]), g1=r1.L.G[0], rf=c=>KX.reachFactor(r1.K,g1,KX.dwZoneFor(hi,S,c));
          chk('kueche: hohe Spülmaschine – Wege rechnen Untenzeug im unteren Fach (schlecht greifbar), Geschirr oben',
            KX.dwZoneFor(hi,S,'vorrat').key==='unten' && KX.dwZoneFor(hi,S,'teller').key==='oben' && rf('vorrat')>rf('teller')
            && KX.dwZoneFor({...hi,h:1440},S,'teller').key==='unten');
        }
        chk('kueche: hohe Spülmaschine – Küchenmaße ohne oberes Fach räumen Geschirr aus (auch beim Laden), Schrank unter dem Gerät hat keins',
          nT===1 && JSON.stringify(Kt.items[0].store)==='["vorrat"]' && JSON.stringify(Kl.items[0].store)==='["vorrat"]'
          && KX.dwZones({...hi,h:1200},S).length===0 && KX.storable({...hi,h:1200},S).length===0);
      }
      // --- Backofen und Mikrowelle im Hochschrank: Fächer, Höhenprüfung, offene Türen ---
      {
        const S=KX.K_DEF, D=KX.derived(S), ov={kind:'tall',dev:'oven',a:'D',b:'A',x:0,w:600}, mw={kind:'tall',dev:'mw',a:'D',b:'A',x:0,w:600}, dw={kind:'tall',dev:'dw',a:'D',b:'A',x:0,w:600};
        const Zo=KX.devZones(ov,S), Zm=KX.devZones(mw,S), zo=KX.devZ(ov,S), zm=KX.devZ(mw,S);
        chk('kueche: Backofen und Mikrowelle hoch – Fach unten (Sockel bis Gerät) und oben (Gerät bis Oberkante), beide ohne Untenzeug-Zwang',
          Zo.length===2 && Zo[0].z0===S.plinth && Zo[0].z1===zo && Zo[1].z0===zo+600 && Zo[1].z1===D.tallTop && !Zo[0].only
          && Zm.length===2 && Zm[0].z1===zm && Zm[1].z0===zm+380 && zm===D.workH+420 && !Zm[0].only && KX.devZones(dw,S)[0].only);
        const so=KX.storable(ov,S), sm=KX.storable(mw,S);
        chk('kueche: Backofen und Mikrowelle hoch – Geschirr und Vorräte möglich, kein Müll, Besteck, Messer, Kühlware; je Fach eins',
          [so,sm].every(st=>['teller','tassen','vorrat','toepfe','backen'].every(k=>st.includes(k)) && !st.some(k=>['muell','besteck','messer','kuehl'].includes(k)))
          && KX.storeCap(ov,S)===2 && KX.storeFits(ov,S,['teller','tassen']) && !KX.storeFits(ov,S,['teller','tassen','vorrat'])
          && KX.storeFits({...mw,h:1200},S,['teller']) && !KX.storeFits({...mw,h:1200},S,['teller','vorrat']));
        chk('kueche: Backofen und Mikrowelle hoch – Wege: Geschirr ins besser greifbare Fach (unten), Spülmaschine weiter oben',
          KX.dwZoneFor(ov,S,'teller').key==='unten' && KX.dwZoneFor(mw,S,'teller').key==='unten' && KX.dwZoneFor(dw,S,'teller').key==='oben'
          && (()=>{ const r=lay([{...ov,id:1,store:['teller']}]); return (KX.stations(E,r.K,r.L).teller||[]).some(x=>x.id===1); })());
        const Kn=KX.normKitchen({items:[{...ov,id:1,store:['teller','tassen','vorrat']},{...ov,id:2,a:'A',b:'B',x:0,h:1300,store:['teller']}]});
        chk('kueche: Backofen hoch – beim Laden höchstens je Fach ein Inhalt, zu niedriger Schrank ohne Inhalt',
          JSON.stringify(Kn.items[0].store)==='["teller","tassen"]' && !('store' in Kn.items[1]));
        const O=(()=>{ const r=lay([{id:1,kind:'base',a:'A',b:'B',x:600,w:600,dev:'sink'},{id:2,kind:'tall',dev:'oven',a:'A',b:'B',x:1200,w:600},
          {id:3,kind:'base',a:'A',b:'B',x:1800,w:600,dev:'hob',noOven:true,front:'drawer'},{id:4,kind:'tall',dev:'mw',a:'B',b:'C',x:700,w:600},{id:5,kind:'tall',dev:'fridge',a:'B',b:'C',x:1300,w:600,store:['kuehl']}]);
          return {r, O:KX.optimalStore(E,r.K,r.L)}; })();
        chk('kueche: optimal einräumen – Backofen und Mikrowelle hoch bekommen je Fach höchstens eins, nie Müll, Besteck oder Messer',
          [2,4].every(id=>{ const L=Object.entries(O.O.assign).filter(([,ids])=>ids.includes(id)).map(([k])=>k);
            return L.length<=2 && !L.some(k=>['muell','besteck','messer'].includes(k)) && KX.storeFits(O.r.K.items.find(i=>i.id===id),O.r.K.spec,L); })
          && Object.values(O.O.assign).some(ids=>ids.includes(2)||ids.includes(4)));
        // Höhenprüfung: Spülmaschine 815, Backofen 600, Mikrowelle 380 ab Unterkante.
        const low=(it,h)=>lay([{...it,id:1,h}]).F.filter(f=>/Hochschrank zu niedrig für das Gerät/.test(f.txt));
        const fo=low(ov,1300), fd=low(dw,1200), fm=low(mw,800);
        chk('kueche: Hochschrank zu niedrig für das Gerät – Backofen, Spülmaschine und Mikrowelle rot, Abhilfe Standardhöhe; passend kein Befund',
          [fo,fd,fm].every(F=>F.length===1 && F[0].lvl==='bad' && F[0].fix && F[0].fix.label==='Standardhöhe' && F[0].fix.del[0]==='h')
          && new RegExp(`gebraucht ${zo+600} mm`).test(fo[0].txt) && new RegExp(`gebraucht ${KX.devZ(dw,S)+815} mm`).test(fd[0].txt)
          && low(ov,zo+600).length===0 && low(dw,KX.devZ(dw,S)+815).length===0 && low(mw,1000).length===0 && [ov,dw,mw].every(it=>low(it,undefined).length===0)
          && KX.devZones({...ov,h:1300},S).length===0 && KX.storable({...mw,h:800},S).length===0);
        {
          // sweep zählt Befunde: der Höhenbefund hängt nicht an der Lage, das Optimum bleibt erreichbar.
          // (Ofen zwischen Spüle und Herd: fitsAt sperrt seit dem Review die
          // Zone vor der Tür an C–D, die Lagen ab 1850 an B–C wären rot.)
          const items=h=>[{id:1,kind:'base',a:'B',b:'C',x:0,w:600,dev:'sink'},{id:2,kind:'tall',dev:'oven',a:'B',b:'C',x:1200,w:600,h},{id:3,kind:'base',a:'B',b:'C',x:1800,w:600,dev:'hob',noOven:true,front:'drawer'}];
          const ax=h=>{ const r=lay(items(h)), sw=KX.sweep(E,r.K,r.L,2); return sw && sw.axes[0]; }, a1=ax(1300), a0=ax(undefined);
          chk('kueche: zu niedriger Backofen-Hochschrank – Verschieben findet weiter eine Lage, der Befund zählt an jeder Stelle genau einmal',
            !!a1 && !!a1.best && a1.pts.length>2 && a1.pts.length===a0.pts.length && a1.pts.every((p,i)=>p.v===a0.pts[i].v && p.bad===a0.pts[i].bad+1 && p.ok===a0.pts[i].ok)
            && a1.best.v===a0.best.v);
        }
        // Hüllen = Fronten: gleiche Höhen (Fuge 3 mm), Mikrowelle in drei Teilen.
        const same=it=>{ const r=lay([{...it,id:1}]), g=r.L.G[0], P=KX.frontsOf(g,S.plinth,g.z1,r.L.D,S).slice().sort((p,q)=>p.z0-q.z0), Ev=g.env.slice().sort((p,q)=>p.z0-q.z0);
          return P.length===3 && Ev.length===3 && P.every((p,i)=>Math.abs(p.z0-(Ev[i].z0+1.5))<0.01 && (Ev[i].what.includes('tür') && Ev[i].what!=='Tür' && it.dev!=='mw' || Math.abs(p.z1-(Ev[i].z1-1.5))<0.01))
            && Ev[0].what==='Tür' && Ev[2].what==='Tür' && Ev[1].what===(it.dev==='mw'?'Mikrowellentür':it.dev==='dw'?'Spülmaschinentür':'Backofentür'); };
        chk('kueche: Hochschrank mit Gerät – Prüfhüllen wie die Fronten: Tür unten, Gerätetür, Tür oben (Mikrowelle nicht mehr eine durchgehende Tür)',
          [ov,dw,mw].every(same) && (()=>{ const g=lay([{...mw,id:1,hinge:'right'}]).L.G[0], e=g.env; return e[0].side==='right' && e[2].side==='right' && e[1].side==='left'; })()
          && [ov,dw].every(it=>{ const K=KX.normKitchen(JSON.parse(JSON.stringify({items:[{...it,id:1,hinge:'right'}]}))), r=lay(K.items); return K.items[0].hinge==='right' && r.L.G[0].env.filter(e=>e.what==='Tür').every(e=>e.side==='right'); }));
        // Offen-Ansicht: Schranktüren über und unter dem Gerät sind offen da.
        const openDoors=it=>{ const r=lay([{...it,id:1}]), g=r.L.G[0], sg=KX.devSegs(r.K.items[0],S), S1=KX.scene(E,r.K,r.L,{open:true});
          const n=g.n, f=g.front[0], out=p=>Math.max(...p.poly.map(q=>(q.x-f.x)*n.x+(q.y-f.y)*n.y));
          const at=(z0,z1)=>S1.prisms.some(p=>p.id===1 && Math.abs(p.z0-z0)<0.01 && Math.abs(p.z1-z1)<0.01 && out(p)>500);
          return at(sg.z0,sg.zd) && at(sg.zt,g.z1); };
        chk('kueche: 3D offen – Schranktüren über und unter Backofen, Spülmaschine und Mikrowelle stehen offen (verschwinden nicht)',
          [ov,dw,mw].every(openDoors));
      }
      chk('kueche: Kochfeld ohne Backofen – Schubladen statt Backofentür, Töpfe darunter möglich, bleibt nach Import',
        (()=>{ const r=lay([{id:1,kind:'base',dev:'hob',a:'D',b:'A',x:0,w:600,noOven:true,front:'drawer'}]); const it=r.K.items[0], e=r.L.G[0].env;
          const mit=lay([{id:1,kind:'base',dev:'hob',a:'D',b:'A',x:0,w:600}]);
          return it.noOven===true && KX.frontKind(it)==='drawer' && e.length===1 && e[0].what==='Auszug' && KX.storable(it).includes('toepfe')
            && KX.nameOf(it)==='Kochfeld 60' && mit.L.G[0].env[0].what==='Backofentür' && KX.storable(mit.K.items[0]).length===0; })());
      chk('kueche: Wasseranschluss – Schlauchweg an der Wand um die Ecke, Spülmaschine nah ok, weit gelb, sehr weit rot, ohne Anschluss Hinweis',
        (()=>{ const dw=[{id:1,kind:'base',dev:'dw',a:'D',b:'A',x:0,w:600}];
          const run=water=>{ const Ew=KX.makeEnv(R.pts,R.walls,[win,door],[],water); const K=KX.normKitchen({items:dw}); return KX.check(Ew,K,KX.layout(Ew,K)); };
          const none=run([]), near=run([{id:'w1',a:'C',b:'D',x:3700,y:500}]), mid=run([{id:'w1',a:'A',b:'B',x:300,y:500}]), far=run([{id:'w1',a:'B',b:'C',x:3000,y:500}]);
          const Ew=KX.makeEnv(R.pts,R.walls,[],[],[]); const around=KX.alongWall(Ew,{x:0,y:300},{x:300,y:0});
          return has(none,/Kein Wasseranschluss/,'info') && !has(near,/Schlauchweg/) && has(mid,/Schlauchweg.*Verlängerung nötig/,'warn') && has(far,/auch mit Verlängerung/,'bad') && Math.abs(around-600)<1; })());
      chk('kueche: Kühlschrank mit Festwasser – Einbau 1150 mm, bleibt nach Import, ohne Festwasser keine Prüfung',
        (()=>{ const Ew=KX.makeEnv(R.pts,R.walls,[win,door],[],[{id:'w1',a:'A',b:'B',x:3500,y:500}]);
          const run=items=>{ const K=KX.normKitchen({items}); return {K, F:KX.check(Ew,K,KX.layout(Ew,K))}; };
          const fw=run([{id:1,kind:'tall',dev:'fridge',a:'D',b:'A',x:0,w:600,water:true}]), ohne=run([{id:1,kind:'tall',dev:'fridge',a:'D',b:'A',x:0,w:600}]);
          return fw.K.items[0].water===true && has(fw.F,/Festwasser.*1150/,'warn') && !has(ohne.F,/Festwasser|Wasseranschluss/); })());
      chk('kueche: hoch eingebaute Spülmaschine über dem Abfluss – Ablauf belüften',
        (()=>{ const Ew=KX.makeEnv(R.pts,R.walls,[win,door],[],[{id:'w1',a:'A',b:'B',x:300,y:450}]); const K=KX.normKitchen({items:[{id:1,kind:'tall',dev:'dw',a:'D',b:'A',x:0,w:600}]});
          return has(KX.check(Ew,K,KX.layout(Ew,K)),/belüften/,'info'); })());
      {
        // Wege-Analyse: eine kleine vollständige Küche (alle Abläufe)
        const Ea=KX.makeEnv(R.pts,R.walls,[door],[]);
        const Ka=KX.normKitchen({items:[
          {id:1,kind:'base',dev:'sink',a:'A',b:'B',x:600,w:600,store:['muell']},{id:2,kind:'base',dev:'dw',a:'A',b:'B',x:1200,w:600},
          {id:3,kind:'base',dev:'hob',a:'A',b:'B',x:2400,w:600},{id:4,kind:'base',a:'A',b:'B',x:1800,w:600,store:['besteck','messer']},
          {id:5,kind:'tall',dev:'fridge',a:'B',b:'C',x:0,w:600},{id:6,kind:'wall',a:'A',b:'B',x:1800,w:600,store:['teller','glaeser']},
          {id:7,kind:'base',a:'A',b:'B',x:3000,w:600,store:['toepfe','gewuerze']},{id:8,kind:'tall',a:'B',b:'C',x:600,w:600,store:['vorrat','tassen']},
          {id:9,kind:'table',x:2000,y:2000,rot:0,w:1200,d:800}]});
        const La=KX.layout(Ea,Ka), Ra=KX.flows(Ea,Ka,La), H=KX.heatGrid(Ea,Ra);
        chk('kueche-analyse: Heatmap hat eine Spitze im Raum, alle Abläufe vollständig',
          Ra.complete===Ra.flows.length && H.max>0 && H.peak && TILES.pointInRing(H.peak, TILES.ringsOf(Ea.ring)[0]));
        const Rk=KX.flows(Ea,Ka,La,{planner:KX.planner(Ea,La,[KX.kidPoly(H.peak)])});
        chk('kueche-analyse: Kind am meistbelaufenen Punkt macht die Wege länger oder sperrt einen', Rk.kmYear>Ra.kmYear || Rk.flows.some(f=>f.blocked));
        const C=KX.conflicts(Ra);
        chk('kueche-analyse: zu zweit – Begegnungen je Paar, absteigend sortiert, Kochen+Getränke begegnen sich',
          C.length===KX.PAIRS.length && C.every((x,i)=>!i || C[i-1].len>=x.len) && C.find(x=>x.a==='kochen'&&x.b==='kaffee').len>0);
        const s1=KX.sweep(Ea,Ka,La,9), s2=KX.sweep(Ea,Ka,La,9);
        const ax=s1.axes[1];
        chk('kueche-analyse: Verschieben der Insel/des Tischs – zwei Achsen, deterministisch, Optimum nie schlechter als jetzt, ohne gesperrte Wege',
          s1.axes.length===2 && JSON.stringify(s1)===JSON.stringify(s2) && ax.best && ax.best.km<=ax.pts.find(p=>p.v===0).km+1e-9
          && ax.best.blocked===Math.min(...ax.pts.filter(p=>p.complete===ax.best.complete).map(p=>p.blocked)));
        const Kb={...Ka, items:Ka.items.map(it=>it.id===9?{...it, x:it.x+ax.dir.x*ax.best.v, y:it.y+ax.dir.y*ax.best.v}:it)};
        const s3=KX.sweep(Ea,Kb,KX.layout(Ea,Kb),9);
        chk('kueche-analyse: am Optimum gesetzt ist es dort das Optimum (Fixpunkt)', Math.abs(s3.axes[1].best.v)<1e-6);
        {
          // Mit Fenster: das Optimum für Tisch und Unterschrank bringt keinen neuen Befund.
          const Ew=KX.makeEnv(R.pts,R.walls,[win,door],[]), Lw=KX.layout(Ew,Ka);
          const cnt=(K)=>{ const F=KX.check(Ew,K,KX.layout(Ew,K)); return [F.filter(f=>f.lvl==='bad').length, F.filter(f=>f.lvl==='warn').length]; };
          const c0=cnt(Ka), moved=[];
          [9,4].forEach(id=>{ const S=KX.sweep(Ew,Ka,Lw,id), it=Ka.items.find(x=>x.id===id);
            S.axes.forEach(ax=>{ if(ax.best) moved.push(ax.key==='wall'?{...it,x:ax.best.v}:{...it,x:it.x+ax.dir.x*ax.best.v,y:it.y+ax.dir.y*ax.best.v}); });
            S.swaps.filter(x=>x.ok).forEach(x=>{ const o=Ka.items.find(q=>q.id===x.with); moved.push([{...it,a:o.a,b:o.b,x:o.x},{...o,a:it.a,b:it.b,x:it.x}]); }); });
          chk('kueche-analyse: Optimum und Tausch bringen keinen neuen roten oder gelben Befund',
            moved.length>=3 && moved.every(m=>{ const ts=[].concat(m), K2={...Ka, items:Ka.items.map(x=>ts.find(t=>t.id===x.id)||x)}, c=cnt(K2); return c[0]<=c0[0] && c[1]<=c0[1]; }));
        }
        const sw=KX.sweep(Ea,Ka,La,4);
        chk('kueche-analyse: volle Zeile – Tauschen mit gleich breiten Unterschränken wird angeboten', sw.swaps.length>=2 && sw.swaps.every(x=>isFinite(x.km)));
        const tight=[{id:1,kind:'base',a:'A',b:'B',x:0,w:600},{id:2,kind:'island',x:1000,y:2090,rot:180,w:1200,d:600}];
        const one=lay(tight), two=lay(tight.map(x=>x)); two.K.spec.persons=2; const F2=KX.check(E,two.K,two.L);
        chk('kueche: zu zweit gilt der Gang für mehrere Köche (NKBA 1219 mm)', !has(one.F,/mehrere|zu zweit/) && has(F2,/zu zweit kochen: NKBA mind\. 1219/,'warn')
          && KX.normKitchen({spec:{persons:2}}).spec.persons===2 && KX.normKitchen({spec:{persons:9}}).spec.persons===3);
      }
      chk('kueche: 60 mm neben der Wand – 96er Tür geht 90° auf, 140er nicht mehr (bad)',
        !has(lay([fd(60)]).F, /Flügel: geht nur/) && has(lay([{...fd(60), doorT:140}]).F, /Flügel: geht nur \d+° auf, die Wand/, 'bad'));
      chk('kueche: Side by Side 50 mm neben Unterschränken (Bosch: A ≤ 600 → 50 mm) – geht ganz auf',
        !has(lay([{id:2,kind:'base',a:'B',b:'C',x:350,w:600},{...fd(1000), fz:'sbs', w:910},{id:3,kind:'base',a:'B',b:'C',x:1960,w:600}]).F, /Flügel/));
      chk('kueche: Side by Side neben 70 cm tiefem Hochschrank ohne Luft – geht nicht ganz auf',
        has(lay([{id:2,kind:'tall',a:'B',b:'C',x:400,w:600,d:700},{...fd(1000), fz:'sbs', w:910}]).F, /Gefrierteil \(links\): geht/));
      chk('kueche: keine Angel-Meldung und kein Anschlag bei Flügeltüren',
        !has(lay([fd(0)]).F, /Angel/));
      {
        const {K,L}=lay([fd(1000)]), S1=KX.scene(E,K,L,{open:true}), S0=KX.scene(E,K,L,{});
        const big=S=>S.prisms.filter(p=>p.id===1 && Math.hypot(p.poly[1].x-p.poly[0].x, p.poly[1].y-p.poly[0].y)>400 && Math.hypot(p.poly[2].x-p.poly[1].x, p.poly[2].y-p.poly[1].y)>60).length;
        chk('kueche: 3D zeigt beide Flügel offen in Türdicke', big(S1)>=2 && S0.prisms.filter(p=>p.id===1).length>=5);
      }
      {
        // Zimmertür direkt neben dem Gerät (Wand A–B, Band an der Kühlschrankseite)
        const d3={id:'o9',kind:'door',a:'A',b:'B',x:1200,w:900,y:0,h:2000,swing:{type:'turn',hinge:'left',out:false}};
        const E3=KX.makeEnv(R.pts,R.walls,[d3],[]), K=KX.normKitchen({items:[{id:1,kind:'tall',dev:'fridge',fz:'fd',a:'A',b:'B',x:250,w:900}]});
        chk('kueche: Flügel schlägt an die Zimmertür daneben', KX.check(E3,K,KX.layout(E3,K)).some(f=>/Flügel.*die Zimmertür/.test(f.txt)));
      }
    }
    // --- Review-Fix wege ---
    {
      // Einspringende Raumecken sind Umlenkpunkte: vorher lagen sie genau auf
      // dem Rand und pointInRoom warf sie je nach Lage weg (Umweg über die Ecke 300/300).
      const envOf=(P,extra)=>{ const pts=P.map(([x,y],i)=>({id:String.fromCharCode(65+i),x,y}));
        const ws=pts.map((p,i)=>[p.id,pts[(i+1)%pts.length].id]);
        (extra||[]).forEach(([x,y],i)=>pts.push({id:'P'+i,x,y}));
        if(extra) extra.forEach((_,i)=>ws.push(['P'+i,'P'+((i+1)%extra.length)]));
        return KX.makeEnv(pts,ws,[],[]); };
      const plOf=Ex=>KX.planner(Ex, KX.layout(Ex, KX.normKitchen({items:[]})));
      const ideal=Math.hypot(2300,700)+Math.hypot(1700,1300);
      const Ls=[[[0,0],[6000,0],[6000,2000],[3000,2000],[3000,4000],[0,4000]],
                [[0,0],[6000,0],[6000,4000],[3000,4000],[3000,2000],[0,2000]]];
      const rL=Ls.map(P=>plOf(envOf(P))).map((pl,k)=>k===0 ? pl.route({x:5000,y:1000},{x:1000,y:3000}) : pl.route({x:1000,y:1000},{x:5000,y:3000}));
      chk('kueche: Weg im L-Raum geht über die Innenecke, in jeder Lage gleich lang (≈4544, nicht 7541)',
        rL.every(r=>r.ok && Math.abs(r.len-ideal)<5 && r.path.length===3));
      const Ep=envOf([[0,0],[5000,0],[5000,4000],[0,4000]], [[2300,1000],[2700,1000],[2700,3000],[2300,3000]]);
      const room=TILES.insetRoom(Ep.ring,()=>300), plP=plOf(Ep);
      const r1=plP.route({x:1000,y:1500},{x:4000,y:1500}), r2=plP.route({x:1000,y:2500},{x:4000,y:2500});
      chk('kueche: Weg um einen Pfeiler nimmt die nahen Lochecken (≈3561 oben wie unten, nicht 5118)',
        r1.ok && r2.ok && Math.abs(r1.len-(2*Math.hypot(1000,800)+1000))<8 && Math.abs(r1.len-r2.len)<1
        && r1.path.slice(1,-1).every(p=>p.y<1000) && [...r1.path,...r2.path].every(p=>TILES.pointInRoom(p,room)));
    }
    // --- Review-Fix einraeumen ---
    {
      const opt=items=>{ const r=lay(items); return {r, O:KX.optimalStore(E,r.K,r.L)}; };
      const lost=O=>!Array.isArray(O.dropped) || O.dropped.length>0;
      const fr={id:1,kind:'tall',a:'A',b:'B',x:0,w:600,dev:'fridge'}, tb={id:9,kind:'table',x:1500,y:2200,rot:0,w:1400,d:800};
      // Besteck und Messer im Drehtür-Unterschrank, keine Schublade in der Küche:
      // bleiben, wo sie sind, und werden als Regelverstoß genannt; Entfernen ist keine Ersparnis.
      {
        const {O}=opt([fr,{id:2,kind:'base',a:'A',b:'B',x:600,w:900,front:'door',store:['besteck','teller','messer']},
          {id:3,kind:'base',a:'A',b:'B',x:1500,w:600,dev:'sink',store:['muell','putz']},{id:4,kind:'base',a:'A',b:'B',x:2100,w:600,dev:'dw'},
          {id:5,kind:'base',a:'A',b:'B',x:2700,w:900,dev:'hob',noOven:true,front:'door',store:['toepfe','gewuerze']},
          {id:6,kind:'base',a:'B',b:'C',x:700,w:900,front:'door',store:['glaeser','tassen','vorrat']},{id:7,kind:'tall',a:'B',b:'C',x:1600,w:600,store:['backen']},tb]);
        chk('kueche: optimal einräumen nimmt nichts heraus – Besteck/Messer ohne Schublade bleiben und werden als Regelverstoß genannt',
          !lost(O) && O.assign.besteck.join()==='2' && O.assign.messer.join()==='2' && O.placedAfter===O.placedBefore && O.completeAfter>=O.completeBefore
          && ['besteck','messer'].every(k=>(O.kept||[]).some(x=>x.c===k && x.id===2 && x.why==='schublade') && (O.violations||[]).some(v=>v.c===k && v.id===2 && v.why==='schublade')));
      }
      // Überfüllt (3 Inhalte im 600er, höchstens 2): ist woanders Platz, zieht einer
      // um (Regelverstoß behoben, als Fortschritt erkannt); sonst bleibt er.
      {
        const st={id:2,kind:'base',a:'A',b:'B',x:600,w:600,front:'drawer',store:['besteck','teller','glaeser']}, sk={id:3,kind:'base',a:'A',b:'B',x:1200,w:600,dev:'sink'};
        const A=opt([fr,st,sk,{id:4,kind:'base',a:'A',b:'B',x:1800,w:600,front:'drawer'},{id:5,kind:'base',a:'A',b:'B',x:2400,w:600,dev:'hob'},
          {id:6,kind:'base',a:'B',b:'C',x:700,w:900,front:'drawer'},tb]).O;
        const B=opt([fr,st,sk,tb]).O;
        chk('kueche: optimal einräumen bei Überfüllung – zieht um, wenn Platz ist, sonst bleibt alles und „zu voll“ wird genannt',
          !lost(A) && ['besteck','teller','glaeser'].every(k=>A.assign[k].length) && (A.violations||[]).some(v=>v.id===2 && v.why==='voll')
          && !(A.kept||[]).length && A.better && Object.values(A.assign).filter(ids=>ids.includes(2)).length<=2
          && !lost(B) && ['besteck','teller','glaeser'].every(k=>B.assign[k].join()==='2') && (B.kept||[]).some(x=>x.id===2 && x.why==='voll'));
      }
      // Hohe Spülmaschine, Plätze knapp: Backbleche (ohne Ablauf) verdrängen
      // weder eingeräumte Vorräte/Töpfe noch – leer gestartet – die häufig
      // gebrauchten Inhalte; Besteck bekommt die Schublade.
      {
        const items=[fr,{id:2,kind:'tall',a:'A',b:'B',x:600,w:600,dev:'dw',store:['vorrat','toepfe']},
          {id:3,kind:'base',a:'A',b:'B',x:1200,w:600,dev:'sink'},{id:4,kind:'base',a:'A',b:'B',x:1800,w:600,front:'drawer'},
          {id:5,kind:'base',a:'A',b:'B',x:2400,w:600,dev:'hob'},tb];
        const A=opt(items).O, {r, O:B}=opt(items.map(it=>{ const o={...it}; delete o.store; return o; }));
        const use=k=>KX.FLOWS.reduce((s,F)=>s+(F.chains.flat().includes(k) ? F.f*(F.back?2:1) : 0),0);
        const placed=Object.keys(B.assign).filter(k=>B.assign[k].length);
        // Tausch „Fehlendes u statt Eingeräumtem p“ nach den Regeln möglich?
        const swapOk=(u,p)=>{ const id=B.assign[p][0], h=r.L.byId.get(id);
          if(!KX.storable(h.it,r.K.spec).includes(u) || ((u==='besteck'||u==='messer') && KX.frontKind(h.it)!=='drawer')) return false;
          return KX.storeFits(h.it,r.K.spec,placed.filter(k=>B.assign[k].includes(id)).map(k=>k===p?u:k)); };
        chk('kueche: optimal einräumen bei knappen Plätzen – eingeräumte Vorräte/Töpfe bleiben, Backbleche verdrängen sie nicht',
          !lost(A) && A.assign.vorrat.length && A.assign.toepfe.length && !A.assign.backen.includes(2) && A.placedAfter>A.placedBefore && A.better);
        chk('kueche: optimal einräumen bei knappen Plätzen – Häufiges vor Seltenem (Töpfe statt Backbleche unten, Besteck in die Schublade)',
          B.assign.toepfe.join()==='2' && !B.assign.backen.length && B.assign.besteck.join()==='4'
          && B.unplaced.length && B.unplaced.every(u=>placed.every(p=>!swapOk(u,p) || use(u)<=use(p))));
      }
    }
    // --- Review-Fix stueckliste ---
    {
      // Stückliste: nur bestellgleiche Teile in einer Zeile, jede Zeile sagt,
      // worin sie sich unterscheidet (Front, Höhe, Tiefe, Insel, Eck-Typ).
      const R5=rect(6000,5000), E5=KX.makeEnv(R5.pts,R5.walls,[],[]);
      const st=items=>{ const K=KX.normKitchen({items}); return KX.stock(K,KX.layout(E5,K)).list; };
      const row=(L,re)=>L.filter(r=>re.test(r.text));
      const distinct=L=>new Set(L.map(r=>r.text)).size===L.length;
      const B=st([{id:1,kind:'base',a:'A',b:'B',x:0,w:600,front:'drawer'},{id:2,kind:'base',a:'A',b:'B',x:600,w:600,front:'door'},
                  {id:3,kind:'base',a:'A',b:'B',x:1200,w:600,front:'door',d:350},{id:4,kind:'base',a:'A',b:'B',x:1800,w:600}]);
      chk('kueche: Stückliste trennt Unterschränke nach Front und Tiefe (Schubladen 2×, Drehtür, Drehtür T 35)',
        B.length===3 && distinct(B) && row(B,/^Unterschrank 60 cm · Schubladen$/)[0]?.n===2
        && row(B,/^Unterschrank 60 cm · Drehtür$/)[0]?.n===1 && row(B,/^Unterschrank 60 cm · Drehtür · T 35$/)[0]?.n===1);
      const W=st([{id:1,kind:'wall',a:'A',b:'B',x:0,w:600},{id:2,kind:'wall',a:'A',b:'B',x:600,w:600,h:360},
                  {id:3,kind:'wall',a:'A',b:'B',x:1200,w:600,h:KX.K_DEF.wallH},
                  {id:4,kind:'tall',a:'C',b:'D',x:0,w:600,h:1400},{id:5,kind:'tall',a:'C',b:'D',x:600,w:600}]);
      chk('kueche: Stückliste trennt Hänge- und Hochschränke nach Höhe, Standardhöhe ausdrücklich = ohne Angabe',
        W.length===4 && distinct(W) && row(W,/^Hängeschrank 60 cm · Drehtür$/)[0]?.n===2 && row(W,/^Hängeschrank 60 cm · Drehtür · H 36$/)[0]?.n===1
        && row(W,/^Hochschrank 60 cm · Drehtür · H 140$/)[0]?.n===1 && row(W,/^Hochschrank 60 cm · Drehtür$/)[0]?.n===1);
      const S=st([{id:1,kind:'base',dev:'sink',a:'B',b:'C',x:0,w:600},{id:2,kind:'island',dev:'sink',x:3000,y:2500,rot:0,w:600,d:900}]);
      chk('kueche: Stückliste – Spüle im Unterschrank und in der Insel sind zwei unterscheidbare Zeilen',
        S.length===2 && distinct(S) && row(S,/^Spüle 60 cm .*Insel/).length===1);
      const C=st([{id:1,kind:'base',a:'A',b:'B',x:0,w:1000,corner:true,front:'door',door:500},{id:2,kind:'base',a:'B',b:'C',x:0,w:600},
                  {id:3,kind:'base',a:'A',b:'B',x:3000,w:1000,corner:true,front:'door',door:450},{id:4,kind:'base',a:'C',b:'D',x:3400,w:600},{id:5,kind:'base',a:'D',b:'A',x:2400,w:600}]);
      chk('kueche: Stückliste zeigt Eck-Typ und Innenleben im Text (UED100-50 · Einlegeboden), zwei Eckschränke unterscheidbar',
        distinct(C) && row(C,/^Eckschrank 100 cm · UED100-50 · Einlegeboden$/).length===1 && row(C,/^Eckschrank 100 cm · Tür 45 cm/).length===1
        && C.every(r=>!r.extra || r.text.includes(r.extra)));
      const F=st([{id:1,kind:'tall',dev:'fridge',a:'A',b:'B',x:0,w:600},{id:2,kind:'tall',dev:'fridge',a:'A',b:'B',x:700,w:600,water:true},
                  {id:3,kind:'tall',dev:'fridge',fz:'fd',a:'C',b:'D',x:0,w:900}]);
      chk('kueche: Stückliste – Kühlschrank mit Festwasser und French Door je eigene Zeile, ohne Front-Angabe',
        F.length===3 && distinct(F) && row(F,/^Kühlschrank 60 cm$/).length===1 && row(F,/^Kühlschrank 60 cm · Festwasser$/).length===1 && row(F,/^French Door 90 cm$/).length===1);
    }
    // --- Review-Fix xss ---
    {
      // Präparierte Raumdatei: zweite Tür mit Markup als id (Eingangs-Auswahl in renderWays).
      const bad='"></select><img src=x onerror=alert(1)>';
      const d2={...door, id:bad, a:'A', b:'B', x:200};
      const E2=KX.makeEnv(R.pts,R.walls,[door,d2],[]), doors=KX.entries(E2);
      const h = typeof KX.entryOptions==='function' ? KX.entryOptions(doors, bad) : '';
      chk('kueche: Eingangs-Auswahl escaped Öffnungs-ids aus Dateien (kein Markup)',
        doors.length===2 && (h.match(/<option /g)||[]).length===2 && !/<img|<\/select/.test(h)
        && h.includes(`value="${escapeHtml(bad)}" selected`) && h.includes('value="o2">'));
      // Laden: unplausible ids neu vergeben (frei ab openSeq), gültige und fehlende bleiben.
      const nOk=typeof globalThis.normOpeningIds==='function';
      const ops=[{id:'o1'},{id:'t2'},{id:bad},{id:'o3'},{id:['<i>']},{id:'a b'},{kind:'door'},{id:7}];
      const r = nOk ? globalThis.normOpeningIds(ops, 3) : null;
      chk('kueche: Import ersetzt unplausible Öffnungs-ids, gültige bleiben',
        nOk && ops.map(o=>o.id).join(',')==='o1,t2,o4,o3,o5,o6,,7' && r.map.get(bad)==='o4' && r.map.get('a b')==='o6'
        && r.seq===7 && ops.every(o=>globalThis.openingIdOk(o.id)) && globalThis.normOpeningIds([{id:'o1'}], 2).map.size===0);
    }
    // --- Review-Fix rahmen ---
    {
      // Freie Teile hängen an Bezugsecken (K.frame), nicht an walls[0]
      const free=[{id:1,kind:'island',x:2000,y:1500,rot:0,w:1800,d:900},{id:2,kind:'table',x:1000,y:800,rot:0,w:1200,d:800}];
      const polys=(E,K)=>KX.layout(E,K).G.filter(g=>g.free).sort((a,b)=>a.it.id-b.it.id).map(g=>g.poly);
      const same=(P,Q)=>P.length===Q.length && P.every((p,i)=>p.length===Q[i].length && p.every((q,j)=>Math.hypot(q.x-Q[i][j].x, q.y-Q[i][j].y)<0.5));
      const rot1=[['B','C'],['C','D'],['D','A'],['A','B']], ring=[['D','C'],['C','B'],['B','A'],['A','D']];
      const Ka=KX.normKitchen({frame:{a:'A',b:'B'}, items:free}), P0=polys(KX.makeEnv(R.pts,R.walls,[],[],[],Ka.frame),Ka);
      chk('kueche: Wandreihenfolge ändert sich – Insel und Tisch bleiben, wo sie stehen',
        P0.length===2 && same(P0, polys(KX.makeEnv(R.pts,rot1,[],[],[],Ka.frame),Ka)) && same(P0, polys(KX.makeEnv(R.pts,ring,[],[],[],Ka.frame),Ka)));
      // Alter Stand ohne Anker: übernimmt die erste Wand, Lage unverändert, übersteht Speichern/Laden
      const Ko=KX.normKitchen({items:free}), Po=polys(KX.makeEnv(R.pts,R.walls,[],[]),Ko);
      KX.anchorFrame(Ko, R.pts, R.walls);
      const Kl=KX.normKitchen(JSON.parse(JSON.stringify(Ko)));
      chk('kueche: alter Stand ohne Bezugsecken lädt unverändert (erste Wand wird fest)',
        Kl.frame && Kl.frame.a==='A' && Kl.frame.b==='B' && same(Po, polys(KX.makeEnv(R.pts,rot1,[],[],[],Kl.frame),Kl)) && same(Po, P0));
      chk('kueche: nur Bezugsecken gesetzt – Küche gilt weiter als leer, kaputter Anker fällt weg',
        KX.isEmpty(KX.normKitchen({frame:{a:'A',b:'B'}})) && KX.normKitchen({frame:{a:'A',b:'A'}}).frame===undefined);
      // Bezugsecke gelöscht: im alten Fit umrechnen, Lage im Raum bleibt (schiefer Raum, Drehung zählt)
      const Q=[{id:'A',x:0,y:0},{id:'B',x:4000,y:300},{id:'C',x:4300,y:3000},{id:'D',x:500,y:3200},{id:'E',x:-300,y:1500}];
      const QW=[['A','B'],['B','C'],['C','D'],['D','E'],['E','A']];
      const Kq=KX.normKitchen({frame:{a:'A',b:'B'}, items:[{...free[0], rot:20}, free[1]]}), Pq=polys(KX.makeEnv(Q,QW,[],[],[],Kq.frame),Kq);
      const Q2=Q.filter(p=>p.id!=='A'), QW2=[['B','C'],['C','D'],['D','E'],['E','B']];
      KX.anchorFrame(Kq, Q2, QW2, Q);
      chk('kueche: Bezugsecke gelöscht – freie Teile behalten ihre Lage',
        !!Kq.frame && Kq.frame.a==='B' && Kq.frame.b==='C' && Math.abs(Kq.items[0].rot-20)>1
        && same(Pq, polys(KX.makeEnv(Q,QW,[],[],[],Kq.frame),Kq)) && polys(KX.makeEnv(Q2,QW2,[],[],[],Kq.frame),Kq).length===2);
    }
    // --- Review-Fix fitsat ---
    {
      // Platzieren (fitsAt/freeSlot) nach denselben harten Regeln wie check():
      // keine Stelle, die check sofort rot meldet, wenn die Wand eine saubere hat.
      const badN=(E,K)=>KX.check(E,K,KX.layout(E,K)).filter(f=>f.lvl==='bad').length;
      const place=(opens,items,nr)=>{
        const E=KX.makeEnv(R.pts,R.walls,opens,[]), K=KX.normKitchen({items}), L=KX.layout(E,K), Wf=KX.wallFrame(E,'A','B');
        const it={id:9,kind:'base',w:600}, x=KX.freeSlot(E,K,L,it,Wf,nr);
        const clean = x!=null && badN(E,KX.normKitchen({items:[...items,{...it,a:'A',b:'B',x}]}))===badN(E,K);
        return {fits:xx=>KX.fitsAt(E,K,L,it,Wf,xx), x, clean};
      };
      const p1=place([{id:'o1',kind:'window',a:'A',b:'B',x:0,w:1200,y:800,h:1200,swing:{type:'tilt',out:false}}],[],null);
      chk('kueche: Unterschrank nicht unter eine Brüstung unter Arbeitshöhe – nächste Stelle neben dem Fenster',
        !p1.fits(0) && p1.clean && near(p1.x,1200,1));
      const p2=place([{id:'o2',kind:'door',a:'D',b:'A',x:2050,w:900,y:0,h:2000,swing:{type:'turn',hinge:'left',out:true}}],[],null);
      chk('kueche: Unterschrank nicht vor eine Tür an der Nachbarwand – erst hinter 600 mm Durchgang',
        !p2.fits(0) && p2.clean && near(p2.x,600,1));
      const p3=place([],[{id:1,kind:'island',x:2000,y:1100,rot:0,w:1800,d:900,bar:400}],1700);
      chk('kueche: Unterschrank nicht unter den Tresen-Überstand einer Insel (fitsAt prüft foot)',
        !p3.fits(1700) && p3.clean);
    }
    // --- Review-Fix beschriftung ---
    // Plan-Etiketten im Bildschirmraum (Meldungen: „120“ über „Besteck“,
    // „Eck 90“ über „Messer …“ und aus dem Korpus, zwei „90“ übereinander).
    // measure ist ein Stub mit fester Zeichenbreite (0,6 × Schriftgröße).
    try{
      const pts4=[{id:'A',x:0,y:0},{id:'B',x:4500,y:0},{id:'C',x:4500,y:3500},{id:'D',x:0,y:3500}];
      const E4=KX.makeEnv(pts4,[['A','B'],['B','C'],['C','D'],['D','A']],[],[]);
      const K4=KX.normKitchen({items:[
        {id:1,kind:'base',corner:true,front:'door',w:900,a:'D',b:'A',x:2600,store:['messer','toepfe']},   // Eck 90 an der Seitenwand
        {id:2,kind:'base',dev:'hob',front:'door',w:900,a:'A',b:'B',x:1500},                              // Kochfeld 90 …
        {id:3,kind:'wall',dev:'hood',front:'open',w:900,a:'A',b:'B',x:1500},                             // … mit Dunstabzug 90
        {id:6,kind:'base',front:'drawer',w:600,a:'A',b:'B',x:600,store:['besteck','teller','backen']},
        {id:5,kind:'wall',front:'door',w:600,a:'A',b:'B',x:600,store:['glaeser','tassen']},
        {id:7,kind:'base',dev:'dw',front:'door',w:600,a:'D',b:'A',x:1800,store:['teller']},
        {id:9,kind:'wall',front:'door',w:600,a:'A',b:'B',x:3000},                                        // Hängeschrank ohne Unterschrank
        {id:4,kind:'island',front:'drawer',w:1200,d:900,x:2200,y:1700,rot:90,store:['besteck','teller','glaeser']}]});
      const L4=KX.layout(E4,K4), measure=(t,f)=>t.length*f.px*0.6;
      const view=(s,rot)=>{ const c=Math.cos(rot), sn=Math.sin(rot); return p=>({x:(p.x*c-p.y*sn)*s+400, y:(p.x*sn+p.y*c)*s+400}); };
      const ovl=(a,b)=>a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
      // 1440 px mit Plan|3D geteilt ≈ 0,094 px/mm, voll ≈ 0,16; dpr 1 und 2; Ansicht gerade, eingenordet (90°), schräg.
      const runs=[]; [1,2].forEach(dpr=>[0.094,0.16].forEach(s=>[0, Math.PI/2, 0.5].forEach(rot=>{
        const toScr=view(s*dpr,rot); runs.push({s, dpr, rot, toScr, lab:KX.planLabels(L4,{toScr, dpr, measure}).labels}); })));
      chk('kueche: Plan-Etiketten überlappen sich nicht (Eck an Seitenwand, gedrehte Insel, Kochfeld + DA; geteilt/voll, dpr 1/2, gedreht)',
        runs.every(R=>R.lab.every((a,i)=>R.lab.every((b,j)=>j<=i || !ovl(a.r,b.r)))));
      chk('kueche: Plan-Etiketten bleiben im eigenen Teil („Eck 90“ und Inhalt laufen nicht aus dem Korpus)',
        runs.every(R=>R.lab.every(l=>{ const g=L4.byId.get(l.id); return KX.rectIn(l.r, (g.outline||g.poly).map(R.toScr)); })));
      const R0=runs.find(R=>R.dpr===1 && R.s===0.094 && R.rot===0), is=(id,role)=>R0.lab.find(l=>l.id===id && l.role===role);
      chk('kueche: gedrehte Insel – Breite „120“ und Inhalt untereinander statt nebeneinander',
        runs.every(R=>{ const h=R.lab.find(l=>l.id===4 && l.role==='head'), u=R.lab.find(l=>l.id===4 && l.role==='sub');
          return h && h.txt==='120' && u && /^Besteck/.test(u.txt) && Math.abs(h.x-u.x)<0.5 && u.y>h.y; }));
      chk('kueche: Eckschrank an der Seitenwand – „Eck 90“ mit (gekürztem) Inhalt darunter',
        runs.every(R=>{ const h=R.lab.find(l=>l.id===1 && l.role==='head'), u=R.lab.find(l=>l.id===1 && l.role==='sub');
          return h && h.txt==='Eck 90' && (!u || (u.y>h.y && Math.abs(u.x-h.x)<0.5)); }) && R0.lab.filter(l=>l.id===1 && l.role==='sub').map(l=>l.txt).join('|')==='Messer|Töpfe');
      chk('kueche: Kochfeld 90 + Dunstabzug 90 – nur ein „90“, der Dunstabzug kursiv als „DA“',
        runs.every(R=>R.lab.filter(l=>(l.id===2||l.id===3) && /\b90\b/.test(l.txt)).length===1
          && R.lab.some(l=>l.id===3 && l.role==='wall' && l.txt==='DA' && l.font.italic)));
      chk('kueche: Hängeschrank ohne Unterschrank „H 60“, über deckungsgleichem Unterschrank nur „H“',
        is(9,'wall') && is(9,'wall').txt==='H 60' && is(5,'wall') && is(5,'wall').txt==='H');
      {
        // Dunstabzug von Hand 5 mm versetzt über dem Kochfeld: trotzdem kein zweites „90“.
        const K5=KX.normKitchen({items:[{id:2,kind:'base',dev:'hob',front:'door',w:900,a:'A',b:'B',x:1500},{id:3,kind:'wall',dev:'hood',front:'open',w:900,a:'A',b:'B',x:1505}]});
        const lab=KX.planLabels(KX.layout(E4,K5),{toScr:view(0.16,0), dpr:1, measure}).labels;
        chk('kueche: Dunstabzug 5 mm versetzt über Kochfeld 90 – weiter nur ein „90“', lab.filter(l=>/\b90\b/.test(l.txt)).length===1 && lab.some(l=>l.txt==='DA'));
      }
      chk('kueche: Gerätekürzel in der Breitenzeile („60 GS“), kein eigenes Etikett mehr',
        runs.every(R=>R.lab.filter(l=>l.id===7 && l.role==='head').length===1 && R.lab.some(l=>l.id===7 && l.txt==='60 GS')));
      chk('kueche: Inhalt erst umgebrochen (je Inhalt eine Zeile, voll → erstes Wort), dann gekürzt (+n)',
        JSON.stringify(KX.contentCands({store:['messer','toepfe','besteck']}))===JSON.stringify([['Messer, Bretter','Töpfe, Pfannen','Besteck'],['Messer','Töpfe','Besteck'],['Messer','Töpfe +1'],['Messer · Töpfe +1'],['Messer +2'],['+3']])
        && JSON.stringify(KX.contentCands({store:['kuehl']}))==='[]');
      {
        const KL=KX.normKitchen({items:[{id:1,kind:'base',corner:true,ctype:'L',front:'door',cEnd:0,a:'A',b:'D',x:0,w:900,store:['toepfe']}]}), LL=KX.layout(E,KL), g=LL.byId.get(1);
        chk('kueche: L-Eckschrank – Etikett im L-Umriss (auch kleiner Maßstab)',
          [0.06,0.094,0.16].every(s=>{ const toScr=view(s,0), lab=KX.planLabels(LL,{toScr, dpr:1, measure}).labels.filter(l=>l.id===1);
            return lab.length && lab.every(l=>KX.rectIn(l.r, g.outline.map(toScr))); }));
      }
      chk('kueche: Eck-Hängeschrank zeigt das Nennmaß (782 → „80“, nicht „78“)',
        KX.nomCm({kind:'wall',corner:true,w:782})==='80' && KX.nomCm({kind:'base',w:600})==='60');
      const lum=h=>{ const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
      const contrast=(a,b)=>{ const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
      // Hintergründe: KINK.base, KINK.tall, Platte rgba(220,199,163,.55) über base, Hängeschrank-Tönung darüber.
      chk('kueche: Plan-Schrift ≥ 11 px (Hauptetikett 12), Tinte ≥ 4,5:1 auf Unterschrank, Hochschrank und Platte',
        KX.PLAN_TXT.sub>=11 && KX.PLAN_TXT.main>=12 && runs.every(R=>R.lab.every(l=>l.font.px/R.dpr>=11))
        && ['#f1ede4','#e2dccf','#e5d8c0','#d6cab3'].every(b=>contrast(KX.PLAN_TXT.ink,b)>=4.5));
      {
        const LP=CORE.labelPlacer(), q1={x:100,y:100}, q2={x:106,y:102}, o={dpr:1, measure};
        [q1,q2].forEach(q=>LP.occupy({x:q.x-5, y:q.y-5, w:10, h:10}));
        const a=KX.stationLabel(LP,q1,['sink','teller'],o), b=KX.stationLabel(LP,q2,['dw'],o);
        chk('kueche: Stationsetiketten der Wege weichen einander und den Punkten aus', !ovl(a.r,b.r) && a.txt==='Spüle · Teller, Schüsseln');
      }
      chk('kueche: Maßkette beschriftet nur, wenn der gemessene Kasten in die Strecke passt (auch senkrecht)',
        !KX.dimFits({x:0,y:0},{x:30,y:0},38,15,2) && KX.dimFits({x:0,y:0},{x:45,y:0},38,15,2)
        && KX.dimFits({x:0,y:0},{x:0,y:20},38,15,2) && !KX.dimFits({x:0,y:0},{x:0,y:16},38,15,2));
      chk('kueche: Lage-Diagramm – Achsenschrift effektiv ≥ 11 CSS-px (Analysebereich 410/483/527 px, schmal, versteckt)',
        [410,483,527,483.6,200,0].every(w=>{ const b=KX.chartBox(w); return b.fs*(w>0?w:b.W)/b.W>=11-1e-9 && (w<240 || b.W<=w); }));
      // Gegenprüfung: GS/KS fielen im geteilten Bild weg, „H 60“ schrumpfte
      // gedreht zu „H“, Hängeschrank-Inhalt fehlte, Inhalt fiel an Rundung weg.
      {
        const lab=(L,s,rot)=>KX.planLabels(L,{toScr:view(s,rot), dpr:1, measure}).labels, one=(A,id,role)=>A.find(l=>l.id===id && l.role===role);
        const Kd=KX.normKitchen({items:[{id:7,kind:'base',dev:'dw',front:'door',w:600,a:'D',b:'A',x:1800},{id:8,kind:'tall',dev:'fridge',front:'door',w:600,a:'B',b:'C',x:0},
          {id:1,kind:'base',corner:true,front:'door',w:900,a:'D',b:'A',x:2600,store:['messer','toepfe']}]}), Ld=KX.layout(E4,Kd);
        const under=(A,L,s,id,h,t)=>{ const a=one(A,id,'head'), b=one(A,id,'tag'), g=L.byId.get(id), P=(g.outline||g.poly).map(view(s,0));
          return a && b && a.txt===h && b.txt===t && b.y>a.y && Math.abs(a.x-b.x)<0.5 && KX.rectIn(a.r,P) && KX.rectIn(b.r,P); };
        chk('kueche: Gerätekürzel bei kleinem Maßstab darunter („60“/„GS“, „60“/„KS“, „90“/„Eck“) statt weg – und vor dem Inhalt',
          [0.05,0.06,0.067].every(s=>{ const A=lab(Ld,s,0); return under(A,Ld,s,7,'60','GS') && under(A,Ld,s,8,'60','KS') && under(A,Ld,s,1,'90','Eck'); })
          && [0.05,0.06,0.067].every(s=>{ const A=lab(L4,s,0); return under(A,L4,s,7,'60','GS') && !one(A,7,'sub'); })
          // nie Inhalt ohne sein Kürzel (Spülmaschine, Eckschrank)
          && [0.04,0.05,0.06,0.067,0.094].every(s=>[0,Math.PI/2].every(rot=>{ const A=lab(L4,s,rot);
            return [7,1].every(id=>!one(A,id,'sub') || /GS|Eck/.test(A.filter(l=>l.id===id && l.role!=='sub').map(l=>l.txt).join(' '))); })));
        chk('kueche: Hängeschrank ohne Unterschrank behält „H 60“ auch in gedrehter Ansicht (erst jede Stelle, dann kürzen)',
          runs.every(R=>{ const w=R.lab.find(l=>l.id===9 && l.role==='wall'); return w && w.txt==='H 60'; }));
        chk('kueche: Hängeschrank-Inhalt über Unterschrank mit Inhalt bleibt sichtbar (kursiv), ohne den Unterschrank-Inhalt zu verdrängen',
          [0.094,0.123,0.16].every(s=>[0,Math.PI/2].every(rot=>{ const A=lab(L4,s,rot), w=one(A,5,'sub'), b=one(A,6,'sub');
            return w && w.font.italic && b && (s<0.12 || /^Besteck/.test(b.txt)); })));
        const LPr=CORE.labelPlacer(); LPr.occupy({x:0, y:112.76, w:10, h:15});
        const K2=KX.normKitchen({items:[{id:2,kind:'base',dev:'hob',front:'door',w:900,a:'A',b:'B',x:1500},{id:3,kind:'wall',dev:'hood',front:'open',w:900,a:'A',b:'B',x:1500},
          {id:6,kind:'base',front:'drawer',w:600,a:'A',b:'B',x:600,store:['besteck','teller','backen']},{id:5,kind:'wall',front:'door',w:600,a:'A',b:'B',x:600,store:['glaeser','tassen']}]}), L2=KX.layout(E4,K2);
        const at=s=>p=>({x:p.x*s+100, y:p.y*s+100});
        chk('kueche: gestapelte Zeilen stoßen ohne Treffer an (Rundung ließ den Inhalt bei 0,094 px/mm wegfallen)',
          LPr.free({x:0, y:127.75999999999999, w:10, h:14})
          && !!one(KX.planLabels(L2,{toScr:at(0.094), dpr:1, measure}).labels,6,'sub'));
        // Breiten wie in Chromium (DA kursiv 11 px, 90 fett 12 px): „DA“ passt bündig neben „90“.
        const mz=(t,f)=>({DA:15.97, '90':16.01}[t] ?? measure(t,f));
        chk('kueche: „DA“ im geteilten Bild bündig an der Haubenkante statt wegzufallen (Stellen nach Kastengröße)',
          KX.planLabels(L2,{toScr:at(0.0669), dpr:1, measure:mz}).labels.some(l=>l.id===3 && l.txt==='DA'));
      }
    }catch(err){ chk('kueche: Review-Fix beschriftung ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix r2-ui ---
    // Gegenprüfung (echte Küche): Stationsetiketten standen bei vollem Umfeld
    // erzwungen rechts über anderen Stationen, Maßzahlen und der Eingangs-
    // Pille; „Eingang“ doppelt zur Pille; bloßes „+1“; in schräger Ansicht
    // fielen „120“ (Insel) und „DA“ ganz weg.
    try{
      const measure=(t,f)=>t.length*f.px*0.6, ovA=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1e-3 && Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1e-3;
      {
        // Haufen wie „Kochen“: drei Stationen dicht beieinander, rechts die
        // Eingangs-Pille, links ein anklickbares Maß (hart), oben/unten Teil-Etiketten.
        const LP=CORE.labelPlacer(), Q=[{x:200,y:200},{x:212,y:204},{x:200,y:214}], o={dpr:1, measure};
        Q.forEach(q=>LP.occupy({x:q.x-5, y:q.y-5, w:10, h:10, hard:true}));
        [{x:207,y:186,w:130,h:17,hard:true}, {x:96,y:188,w:96,h:24,hard:true}, {x:140,y:160,w:130,h:24}, {x:140,y:228,w:130,h:24}].forEach(r=>LP.occupy(r));
        const before=LP.rects.slice(), B=[['vorrat','gewuerze'],['hob'],['messer']].map((r,i)=>KX.stationLabel(LP,Q[i],r,o));
        chk('kueche: Stationsetiketten im Gedränge – keine überdeckt eine andere, einen Punkt, ein Maß oder die Eingangs-Pille (Ringe, 8+ Richtungen)',
          B.every(b=>b && !before.some(r=>ovA(b.r,r))) && B.every((a,i)=>B.every((b,j)=>j<=i || !ovA(a.r,b.r))) && B.every(b=>!b.forced));
        chk('kueche: weit abgesetztes Stationsetikett bekommt eine Führungslinie an seinen Kasten',
          B.every(b=>b && (b.r.k>1) === !!b.lead) && B.some(b=>b.lead) && B.filter(b=>b.lead).every(b=>b.lead.x>=b.r.x-1e-6 && b.lead.x<=b.r.x+b.r.w+1e-6 && b.lead.y>=b.r.y-1e-6 && b.lead.y<=b.r.y+b.r.h+1e-6));
        // Ganz zugebaut: der kurze Text an der am wenigsten überdeckten Stelle,
        // nie über einem harten Rechteck (rechts liegt das Maß, früher genau dort).
        const LZ=CORE.labelPlacer(), q={x:300,y:300};
        LZ.occupy({x:0, y:0, w:600, h:600}); LZ.occupy({x:306, y:280, w:200, h:40, hard:true});
        const z=KX.stationLabel(LZ,q,['vorrat','gewuerze'],o);
        chk('kueche: Stationsetikett ohne freien Platz – kurz, gekennzeichnet, nie über Maß/Pille',
          z && z.forced && z.txt==='Vorräte · Gewürze' && !ovA(z.r,{x:306, y:280, w:200, h:40}));
        const LV=CORE.labelPlacer(), v=KX.stationLabel(LV,{x:290,y:150},['vorrat'],{...o, view:{w:300,h:300}});
        chk('kueche: Stationsetikett bleibt auf der Leinwand (Punkt am rechten Rand)', v && v.r.x>=0 && v.r.x+v.r.w<=300);
      }
      {
        // Eingang: die Pille sagt es schon – kein eigenes Etikett darüber.
        const LP=CORE.labelPlacer(), o={dpr:1, measure, skip:['eingang']};
        const a=KX.stationLabel(LP,{x:100,y:100},['eingang'],o), b=KX.stationLabel(LP,{x:300,y:100},['eingang','muell'],o);
        chk('kueche: Station „Eingang“ ohne eigenes Etikett, wenn die Eingangs-Pille steht (Müll am selben Punkt bleibt)',
          a===null && b && b.txt==='Müll' && KX.stationLabel(CORE.labelPlacer(),{x:100,y:100},['eingang'],{dpr:1, measure}).txt==='Eingang');
      }
      chk('kueche: genau ein Inhalt ohne bloßes „+1“ (Wort oder nichts), ab zwei bleibt „+n“',
        JSON.stringify(KX.contentCands({store:['besteck']}))==='[["Besteck"]]'
        && JSON.stringify(KX.contentCands({store:['messer','toepfe']}))===JSON.stringify([['Messer, Bretter','Töpfe, Pfannen'],['Messer','Töpfe'],['Messer · Töpfe'],['Messer +1'],['+2']]));
      {
        // Schräge Ansicht (15°-Schritte): Insel 120 und Dunstabzug über Kochfeld.
        const E6=KX.makeEnv([{id:'A',x:0,y:0},{id:'B',x:4500,y:0},{id:'C',x:4500,y:3500},{id:'D',x:0,y:3500}],[['A','B'],['B','C'],['C','D'],['D','A']],[],[]);
        const L6=KX.layout(E6,KX.normKitchen({items:[{id:2,kind:'base',dev:'hob',front:'door',w:900,a:'A',b:'B',x:1500},{id:3,kind:'wall',dev:'hood',front:'open',w:900,a:'A',b:'B',x:1500},
          {id:4,kind:'island',front:'drawer',w:1200,d:600,x:2200,y:2000,rot:0,store:['besteck']}]}));
        const lab=(s,deg)=>{ const c=Math.cos(deg*Math.PI/180), sn=Math.sin(deg*Math.PI/180), toScr=p=>({x:(p.x*c-p.y*sn)*s+400, y:(p.x*sn+p.y*c)*s+400});
          return {toScr, A:KX.planLabels(L6,{toScr, dpr:1, measure}).labels}; };
        const R=[[0.056,30],[0.056,45],[0.054,15],[0.046,30],[0.046,45],[0.042,30],[0.042,45],[0.042,60]].map(([s,d])=>({s, d, ...lab(s,d)}));
        chk('kueche: schräge Ansicht – „120“ der Insel und „DA“ bleiben stehen (Kern im Teil als letzte Stufe)',
          R.every(r=>r.A.some(l=>l.id===4 && l.txt==='120')) && R.filter(r=>r.s>0.05).every(r=>r.A.some(l=>l.id===3 && l.txt==='DA' && l.font.italic)));
        // Dunstabzug über Kochfeld: „90“ stand mitten unter der Haube und ließ
        // „DA“ keinen Platz – die Breite rückt im Kochfeld beiseite (2c).
        chk('kueche: schräge Ansicht – „90“ des Kochfelds rückt beiseite, damit „DA“ daneben steht',
          R.filter(r=>r.s>0.045 && r.s<0.05).every(r=>r.A.some(l=>l.id===3 && l.txt==='DA') && r.A.some(l=>l.id===2 && l.txt==='90')));
        chk('kueche: schräge Ansicht – dabei keine Überlappung, Schrift im eigenen Teil',
          R.every(r=>r.A.every((a,i)=>r.A.every((b,j)=>j<=i || !ovA(a.r,b.r))) && r.A.every(l=>{ const g=L6.byId.get(l.id); return KX.rectIn(l.r,(g.outline||g.poly).map(r.toScr)); })));
      }
      {
        // Gegenprüfung 2: die 3-px-Klickfläche eines anklickbaren Maßes stand
        // schon vor planLabels als hart in der Belegt-Liste – bei gewähltem Teil
        // verloren andere Teile Etiketten („Eck 90“ ohne „Messer +1“, „45“).
        // Jetzt belegt dimLabel nur die Zahl; KX.stationBlock trägt Klickflächen
        // und Punkte erst unmittelbar vor den Stationsetiketten ein.
        const LP=CORE.labelPlacer(), num={x:100,y:100,w:40,h:15,hard:true}, hit={x:97,y:97,w:46,h:21};
        LP.occupy(num); LP.occupy({x:124,y:134,w:100,h:20}); LP.occupy({x:0,y:134,w:117,h:20});
        const near={x:141.5,y:100,w:30,h:15}, partFree=LP.free(near), q={x:120,y:140};
        const L0=CORE.labelPlacer(); LP.rects.forEach(r=>L0.occupy(r));
        const s0=KX.stationLabel(L0,{...q},['hob'],{dpr:1, measure});   // ohne Klickfläche: gleich oben im Band
        KX.stationBlock(LP,[q],[hit],1);
        const s=KX.stationLabel(LP,q,['hob'],{dpr:1, measure});
        chk('kueche: Klickfläche eines Maßes nimmt Teil-Etiketten keinen Platz, Stationsetiketten meiden sie (stationBlock)',
          partFree && s0 && ovA(s0.r,hit) && s && !ovA(s.r,hit) && !ovA(s.r,num) && !LP.free(near) && LP.rects.filter(r=>r.hard).length===3);
      }
      {
        // Führungslinie lief durch Maßzahlen: bei weitem Abstand gewinnt ein
        // Platz, dessen Linie kein belegtes Rechteck kreuzt (rechts liegt eine
        // Zahl genau auf dem Weg zum ersten Ring-2-Platz).
        const LP=CORE.labelPlacer(), q={x:300,y:300}, num={x:318,y:296,w:8,h:8};
        LP.occupy({x:q.x-5,y:q.y-5,w:10,h:10,hard:true}); LP.occupy({x:q.x-27,y:q.y-27,w:54,h:54}); LP.occupy(num);
        const s=KX.stationLabel(LP,q,['vorrat'],{dpr:1, measure});
        const cross=(a,b,R)=>{ for(let i=0;i<=200;i++){ const t=i/200, x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t; if(x>R.x && x<R.x+R.w && y>R.y && y<R.y+R.h) return true; } return false; };
        chk('kueche: Führungslinie eines weit abgesetzten Stationsetiketts kreuzt keine Maßzahl, wenn es anders geht',
          s && s.lead && s.r.k===2 && !s.forced && !cross(q,s.lead,num) && (LP.leads||[]).length===1);
      }
    }catch(err){ chk('kueche: Review-Fix r2-ui ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix r2-daten ---
    try{
      // (1) Numerische Öffnungs-ids (Fremdimport): beim Laden zu Strings,
      // alle Verweise (Lagemaß, Nachbartür, Eingang) ziehen mit. Die
      // Eingangs-Auswahl liefert Strings – Tür 2 muss Tür 2 bleiben.
      const nOk=typeof globalThis.normOpeningIds==='function', rOk=typeof globalThis.remapOpeningRefs==='function';
      const d5={id:5,kind:'door',a:'C',b:'D',x:200,w:900,y:0,h:2000}, d7={id:7,kind:'door',a:'C',b:'D',x:2200,w:900,y:0,h:2000};
      const ops=[d5,d7,{id:'9',kind:'window',a:'A',b:'B',x:0,w:600,y:900,h:1000},{id:9,kind:'window',a:'A',b:'B',x:1000,w:600,y:900,h:1000},{id:1e21}];
      const room={openings:ops, opmeas:[{id:'om1',op:7},{id:'om2',op:9}], shared:{'A|B':{room:'r2',wall:['A','B'],tuer:{op:7}}},
                  kitchen:KX.normKitchen({spec:{entry:7}})};
      const r=nOk ? globalThis.normOpeningIds(ops, 3) : null;
      if(rOk && r) globalThis.remapOpeningRefs(room, r.map);
      chk('kueche: numerische Öffnungs-ids werden beim Laden Strings (frei: „7“, belegt: neu), Verweise ziehen mit',
        nOk && rOk && ops.map(o=>o.id).join(',')==='5,7,9,o3,o4' && ops.every(o=>typeof o.id==='string')
        && r.map.get(7)==='7' && r.map.get(9)==='o3' && room.opmeas.map(m=>m.op).join(',')==='7,o3'
        && room.shared['A|B'].tuer.op==='7' && room.kitchen.spec.entry==='7');
      const E1=KX.makeEnv(R.pts,R.walls,ops,[]), doors=KX.entries(E1), K1=room.kitchen, st=e=>KX.stations(E1,{...K1,spec:{...K1.spec,entry:e}},KX.layout(E1,K1)).eingang[0].p;
      chk('kueche: Eingang „Tür 2“ aus der Auswahl (String) trifft Tür 2, auch nach numerischer id im Import',
        doors.length===2 && KX.entryOptions(doors,'7').includes('value="7" selected') && Math.abs(st('7').x-st('5').x)>1000
        && Math.abs(st(room.kitchen.spec.entry).x-st('7').x)<1e-6);
      // (2) Bezugsecke gelöscht, ohne Fit (alle Messungen aus): in der Skizze umrechnen, nicht springen.
      const cOk=typeof KX.cornerDeleted==='function';
      const Q=[{id:'A',x:0,y:0},{id:'B',x:4000,y:300},{id:'C',x:4300,y:3000},{id:'D',x:500,y:3200},{id:'E',x:-300,y:1500}];
      const QW=[['A','B'],['B','C'],['C','D'],['D','E'],['E','A']], Q2=Q.filter(p=>p.id!=='A'), QW2=[['B','C'],['C','D'],['D','E']];
      const freeI=[{id:1,kind:'island',x:2000,y:1500,rot:20,w:1800,d:900},{id:2,kind:'table',x:1000,y:800,rot:0,w:1200,d:800}];
      const polys=(E,K)=>KX.layout(E,K).G.filter(g=>g.free).sort((a,b)=>a.it.id-b.it.id).map(g=>g.poly);
      const same=(P,Q_)=>P.length===Q_.length && P.every((p,i)=>p.length===Q_[i].length && p.every((q,j)=>Math.hypot(q.x-Q_[i][j].x, q.y-Q_[i][j].y)<0.5));
      const Kc=KX.normKitchen({frame:{a:'A',b:'B'}, items:freeI}), Pc=polys(KX.makeEnv(Q,QW,[],[],[],Kc.frame),Kc);
      if(cOk) KX.cornerDeleted(Kc, 'A', null, Q, QW);
      chk('kueche: Bezugsecke ohne Fit gelöscht – freie Teile in der Skizze umgerechnet, Lage bleibt',
        cOk && !!Kc.frame && Kc.frame.a==='B' && Kc.frame.b==='C' && same(Pc, polys(KX.makeEnv(Q,QW,[],[],[],Kc.frame),Kc)));
      // (3) Lagemaß-ids aus Datei/Link: unplausible und doppelte neu, gültige bleiben.
      const mOk=typeof globalThis.normOpMeasIds==='function';
      const om=[{id:'om2'},{id:'"><img src=x onerror=alert(1)>'},{id:'om2'},{id:5},{id:'x1'},{}];
      const seq=mOk ? globalThis.normOpMeasIds(om, 1) : 0;
      chk('kueche: Lagemaß-ids beim Laden – Markup, Zahl, doppelt und fehlend neu vergeben, gültige bleiben',
        mOk && om.map(m=>m.id).join(',')==='om2,om3,om4,om5,x1,om6' && seq===7 && globalThis.normOpMeasIds([{id:'om9'}], 2)===10);
      // (5) Stückliste: Türanschlag unterscheidet die Bestellung (Standard links ohne Angabe).
      const R5=rect(6000,5000), E5=KX.makeEnv(R5.pts,R5.walls,[],[]);
      const stk=items=>{ const K=KX.normKitchen({items}); return KX.stock(K,KX.layout(E5,K)).list; };
      const L5=stk([{id:1,kind:'tall',dev:'oven',a:'A',b:'B',x:0,w:600},{id:2,kind:'tall',dev:'oven',a:'A',b:'B',x:600,w:600,hinge:'right'},
                    {id:3,kind:'tall',dev:'oven',a:'A',b:'B',x:1200,w:600,hinge:'left'},
                    {id:4,kind:'base',front:'door',a:'C',b:'D',x:0,w:600},{id:5,kind:'base',front:'door',a:'C',b:'D',x:600,w:600,hinge:'right'},
                    {id:6,kind:'base',front:'drawer',a:'C',b:'D',x:1200,w:600,hinge:'right'}]);
      const n5=t=>(L5.find(r=>r.text===t)||{}).n;
      chk('kueche: Stückliste trennt Anschlag rechts (Backofen hoch, Drehtür), Standard links ohne Angabe, Schubladen ohne Anschlag',
        typeof KX.hasHinge==='function' && L5.length===5 && n5('Backofen hoch 60 cm')===2 && n5('Backofen hoch 60 cm · Anschlag rechts')===1
        && n5('Unterschrank 60 cm · Drehtür')===1 && n5('Unterschrank 60 cm · Drehtür · Anschlag rechts')===1 && n5('Unterschrank 60 cm · Schubladen')===1);
      // (6) Zu niedriger Backofen-Hochschrank: Platzieren rechnet mit der nötigen Höhe,
      // die Abhilfe verdeckt kein Fenster.
      const oven={id:2,kind:'tall',dev:'oven',w:600,h:1300}, need=KX.devSegs(oven,KX.K_DEF).need;
      const six=sill=>{
        const E6=KX.makeEnv(R.pts,R.walls,[{id:'o1',kind:'window',a:'A',b:'B',x:1500,w:1000,y:sill,h:900}],[]);
        const K=KX.normKitchen({items:[]}), L=KX.layout(E6,K), Wf=KX.wallFrame(E6,'A','B');
        const K2=KX.normKitchen({items:[{...oven,a:'A',b:'B',x:1700}]}), F=KX.check(E6,K2,KX.layout(E6,K2));
        const low=F.find(f=>/Hochschrank zu niedrig/.test(f.txt));
        return {fits:KX.fitsAt(E6,K,L,oven,Wf,1700), slot:KX.freeSlot(E6,K,L,oven,Wf,1700), low, win:F.some(f=>/verdeckt ein Fenster/.test(f.txt))};
      };
      const s14=six(1400), s15=six(1500);
      chk('kueche: zu niedriger Backofen-Hochschrank – nicht unter ein Fenster, das er in nötiger Höhe verdeckte',
        need>1400 && need<1500 && !s14.fits && s14.slot!=null && (s14.slot+600<=1501 || s14.slot>=2499) && s15.fits);
      chk('kueche: Abhilfe „zu niedrig“ nur, wenn sie kein Fenster verdeckt (Standardhöhe → nötige Höhe → keine)',
        !!s14.low && !s14.low.fix && /Fenster/.test(s14.low.txt) && !s14.win && !!s15.low && !!s15.low.fix && s15.low.fix.set.h===Math.ceil(need/10)*10 && !s15.win);
      {
        // Vor einer Tür: eigener Befund, die Höhen-Abhilfe bleibt Standardhöhe.
        const E7=KX.makeEnv(R.pts,R.walls,[{id:'o1',kind:'door',a:'A',b:'B',x:1500,w:900,y:0,h:2000}],[]);
        const K7=KX.normKitchen({items:[{...oven,a:'A',b:'B',x:1700}]}), F7=KX.check(E7,K7,KX.layout(E7,K7));
        const low=F7.find(f=>/Hochschrank zu niedrig/.test(f.txt));
        chk('kueche: zu niedriger Backofen-Hochschrank vor einer Tür – Türbefund, Abhilfe weiter Standardhöhe',
          F7.some(f=>/steht vor einer Tür/.test(f.txt)) && !!low && !!low.fix && low.fix.label==='Standardhöhe' && !/verdeckte/.test(low.txt));
      }
    }catch(err){ chk('kueche: Review-Fix r2-daten ohne Ausnahme ('+err.message+')', false); }
    // --- Wunsch Zeilenumbruch ---
    // Inhalte erst umbrechen (je Inhalt eine Zeile), dann kürzen.
    try{
      const Ez=KX.makeEnv(R.pts,R.walls,[],[]), Kz=KX.normKitchen({items:[{id:1,kind:'tall',front:'door',w:600,a:'A',b:'B',x:600,store:['teller','glaeser','tassen']}]});
      const Lz=KX.layout(Ez,Kz), mz=(t,f)=>t.length*f.px*0.6;
      const at=s=>KX.planLabels(Lz,{toScr:p=>({x:p.x*s+50,y:p.y*s+50}), dpr:1, measure:mz}).labels.filter(l=>l.id===1);
      const subs=s=>at(s).filter(l=>l.role==='sub').map(l=>l.txt).join('|');
      const A=at(0.3), h=A.find(l=>l.role==='head'), S=A.filter(l=>l.role==='sub');
      chk('kueche: Inhalte umgebrochen – je Inhalt eine Zeile, volle Bezeichnung, wo Platz ist; erst dann kürzer, zuletzt +n',
        subs(0.3)==='Teller, Schüsseln|Gläser|Tassen' && subs(0.12)==='Teller|Gläser|Tassen' && subs(0.06)==='+3'
        && S.every((l,i)=>Math.abs(l.x-h.x)<0.5 && l.y>h.y && (!i || (l.y>S[i-1].y && l.r.y>=S[i-1].r.y+S[i-1].r.h))));
    }catch(err){ chk('kueche: Wunsch Zeilenumbruch ohne Ausnahme ('+err.message+')', false); }
    // --- Feature insel-snap ---
    // Inseln rasten aneinander ein, gleich hohe bekommen eine durchgehende
    // Platte. Raum 4000 × 3000, Tür C–D (Zone x 2700–3600 ab y 2400).
    try{
      const isl=(id,x,y,rot,w,o)=>({id,kind:'island',x,y,rot,w,d:900,...(o||{})});
      const snap=(items,id,tol=50)=>{ const K=KX.normKitchen({items}); return KX.snapIsland(E,K,K.items.find(i=>i.id===id),tol); };
      // wie nach Speichern und Laden
      const put=(items,id,s)=>JSON.parse(JSON.stringify(items.map(i=>i.id===id ? {...i, x:s.x, y:s.y, rot:s.rot} : i)));
      const isTops=r=>r.L.tops.filter(t=>t.island), stTops=r=>KX.stock(r.K,r.L).tops.filter(t=>t.island);
      const A=isl(1,1500,1500,0,1800);
      // längs: Ende an Ende, 30 mm Luft, 20 mm versetzt, 3° schief
      const B1=isl(2,3030,1520,3,1200), s1=snap([A,B1],2);
      chk('kueche-insel: längs – Ende an Ende bündig, Drehung übernommen, Enden bündig',
        !!s1 && s1.with===1 && s1.how==='längs' && s1.rot===0 && near(s1.x,3000,1e-6) && near(s1.y,1500,1e-6));
      const r1=lay(put([A,B1],2,s1)), T1=isTops(r1);
      chk('kueche-insel: längs – eine durchgehende Platte 3,00 × 0,90 m, Stückliste 1 Platte statt 2',
        T1.length===1 && T1[0].ids.length===2 && near(T1[0].len,3000,0.01) && near(T1[0].depth,900,0.01) && T1[0].poly.length===4
        && stTops(r1).length===1 && near(stTops(r1)[0].len,3000,0.01));
      chk('kueche-insel: längs – Berührung ist keine Überlappung', !has(r1.F,/überlappen/));
      const pr1=KX.scene(E,r1.K,r1.L,{}).prisms.filter(p=>Array.isArray(p.edge)), sg1=pr1.flatMap(p=>p.edge);
      chk('kueche-insel: 3D – gemeinsame Platte ohne Fuge (Kanten nur am Umriss, keine bei x=2400)',
        pr1.length===2 && sg1.length===4 && !sg1.some(([p,q])=>near(p.x,2400,1) && near(q.x,2400,1)));
      const pr1s=KX.scene(E,r1.K,r1.L,{sel:new Set([2])}).prisms.filter(p=>Array.isArray(p.edge));
      chk('kueche-insel: 3D – gemeinsame Platte in einer Farbe, auch wenn nur eine Insel gewählt ist',
        pr1s.length===2 && pr1s[0].col.every((v,k)=>v===pr1s[1].col[k]) && pr1s[0].col.some((v,k)=>v!==pr1[0].col[k]));
      // ungleich hoch: rastet ein, aber zwei Platten
      const r1h=lay(put([A,{...B1,h:1050}],2,s1));
      chk('kueche-insel: ungleich hohe Inseln – zwei Platten', isTops(r1h).length===2 && !has(r1h.F,/überlappen/));
      // Seite an Seite: B oberhalb, 20 mm Luft, Fronten zeigen auf A
      const B2=isl(2,1520,580,0,1800), s2=snap([A,B2],2);
      chk('kueche-insel: Seite an Seite – Längsseiten bündig, Enden bündig',
        !!s2 && s2.how==='Seite an Seite' && s2.rot===0 && near(s2.x,1500,1e-6) && near(s2.y,600,1e-6));
      const r2=lay(put([A,B2],2,s2)), T2=isTops(r2);
      chk('kueche-insel: Seite an Seite – eine Platte 1,80 × 1,80 m, keine Überlappung, Auszüge gegen die Nachbarinsel weiter gemeldet',
        T2.length===1 && near(T2[0].len,1800,0.01) && near(T2[0].depth,1800,0.01) && !has(r2.F,/überlappen/) && has(r2.F,/Auszug von Insel 180 stößt an Insel 180/,'bad'));
      // quer (T): Stiel 1200 auf 86° oberhalb der Insel, 20 mm Luft, 20 mm neben der Mitte
      const A3=isl(1,1500,1800,0,1800), B3=isl(2,1480,730,86,1200), s3=snap([A3,B3],2);
      chk('kueche-insel: quer (T) – 90° zur Nachbarinsel, mittig, bündig',
        !!s3 && s3.how==='quer' && s3.rot===90 && near(s3.x,1500,1e-6) && near(s3.y,750,1e-6));
      const r3=lay(put([A3,B3],2,s3)), T3=isTops(r3), sg3=KX.scene(E,r3.K,r3.L,{}).prisms.filter(p=>Array.isArray(p.edge)).flatMap(p=>p.edge);
      chk('kueche-insel: T – eine Platte (T-Umriss, 8 Ecken), Stückliste 1 Platte mit Summenlänge 3,00 m, ohne Fuge',
        T3.length===1 && T3[0].poly.length===8 && T3[0].parts.length===2 && near(T3[0].len,3000,0.01) && near(T3[0].depth,900,0.01)
        && stTops(r3).length===1 && sg3.length===8 && !has(r3.F,/überlappen/));
      // zu weit / zu schief: nicht einrasten
      chk('kueche-insel: 100 mm Luft bei 50 mm Fangweite – kein Einrasten', snap([A,isl(2,3100,1500,0,1200)],2)===null);
      chk('kueche-insel: 40° schief zur Nachbarinsel – kein Einrasten', snap([A,isl(2,3010,1500,50,1200)],2)===null);
      chk('kueche-insel: ohne Nachbarinsel – kein Einrasten', snap([isl(2,3010,1500,0,1200)],2)===null);
      // gedrehte Nachbarinsel (30°)
      const A4=isl(1,1500,1300,30,1800), g4=KX.geom(E,KX.normKitchen({items:[A4]}),A4);
      const c4={x:g4.c.x+g4.u.x*1525+g4.n.x*15, y:g4.c.y+g4.u.y*1525+g4.n.y*15}, B4=isl(2,c4.x,c4.y,33,1200), s4=snap([A4,B4],2);
      const g4b=s4 && KX.geom(E,KX.normKitchen({items:[A4]}),{...B4, x:s4.x, y:s4.y, rot:s4.rot}), dc=g4b && {x:g4b.c.x-g4.c.x, y:g4b.c.y-g4.c.y};
      chk('kueche-insel: gedrehte Nachbarinsel (30°) – Drehung exakt übernommen, Ende an Ende, Enden bündig',
        !!s4 && s4.rot===30 && near(dc.x*g4.u.x+dc.y*g4.u.y,1500,1e-6) && near(dc.x*g4.n.x+dc.y*g4.n.y,0,1e-6));
      const r4=lay(put([A4,B4],2,s4)), T4=isTops(r4);
      chk('kueche-insel: gedreht – eine Platte 3,00 m, keine Überlappung', T4.length===1 && T4[0].poly.length===4 && near(T4[0].len,3000,0.01) && !has(r4.F,/überlappen/));
      // Tresen: Überstand ragt nie in die Nachbarinsel; beide mit Tresen -> eine Platte samt Überstand
      const Ab=isl(1,1500,1500,0,1800,{bar:381}), r5=lay(put([Ab,isl(2,3020,1500,0,1200,{bar:381})],2,snap([Ab,isl(2,3020,1500,0,1200,{bar:381})],2)));
      chk('kueche-insel: Tresen längs – eine Platte 3,00 × 1,281 m', isTops(r5).length===1 && near(isTops(r5)[0].len,3000,0.01) && near(isTops(r5)[0].depth,1281,0.01));
      const A6=isl(1,1500,900,0,1800), B6=isl(2,1500,2200,0,1800,{bar:381}), s6=snap([A6,B6],2), r6=s6 && lay(put([A6,B6],2,s6));
      chk('kueche-insel: Tresen zur Nachbarinsel – Platte stößt an, Überstand ragt nicht hinein, Auszüge gegen den Tresen gemeldet',
        !!s6 && near(s6.y,2181,1e-6) && !has(r6.F,/überlappen/) && isTops(r6).length===1 && has(r6.F,/Auszug von Insel 180 stößt an Insel 180/,'bad'));
      // Einzelne Insel: Platte wie bisher (ein Eintrag, Korpus bzw. Tresen-Grundriss)
      const r7=lay([A]);
      chk('kueche-insel: einzelne Insel – Platte unverändert', isTops(r7).length===1 && !isTops(r7)[0].joined && isTops(r7)[0].poly===r7.L.byId.get(1).poly);
    }catch(err){ chk('kueche-insel: ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: decke ---
    try{
      // Decke mit Knickpunkten (Giebel, Kehle), 3D-Oberkante, Hängeschrank nie unter dem Boden.
      // hz: Eckhöhe h an allen Ecken plus Knicke [id, x ab A, Höhe] auf A–B (oder a,b).
      const hz=(h,ks)=>[...['A','B','C','D'].map(id=>({kind:'h',at:id,d:h})), ...ks.map(([id,x,d,a,b])=>({kind:'k',id,a:a||'A',b:b||'B',x,d,on:true}))];
      const dE=(hm,ops)=>KX.makeEnv(R.pts,R.walls,ops||[],hm);
      const hoch=(Ek,items)=>{ const K=KX.normKitchen({items}), F=KX.check(Ek,K,KX.layout(Ek,K)); return {F, dk:F.filter(f=>/mm hoch, die Decke dort/.test(f.txt))}; };
      const tall=(x,extra)=>({id:1,kind:'tall',a:'A',b:'B',x,w:600,...extra});
      const gi=dE(hz(1800,[['k1',2000,3000]]));
      chk('kueche: Giebelwand – Hochschrank unter dem Knick (Decke dort 2820) ist nicht zu hoch, am Rand (1800) schon',
        hoch(gi,[tall(1700)]).dk.length===0 && hoch(gi,[{...tall(1700),kind:'wall'}]).dk.length===0
        && (()=>{ const r=hoch(gi,[tall(0)]).dk; return r.length===1 && /Decke dort 1800 mm/.test(r[0].txt); })());
      chk('kueche: Kehle – Hochschrank 2166 unter der Kehle (Ecken 2500, Knick 1500) ist zu hoch',
        (()=>{ const r=hoch(dE(hz(2500,[['k1',2000,1500]])),[tall(1700)]).dk; return r.length===1 && r[0].lvl==='bad' && /Decke dort 1500 mm/.test(r[0].txt); })());
      {
        // Beide Enden des Teils 2500, dazwischen 1500: nur die niedrigste Decke über [s0,s1] findet es.
        const dip=dE(hz(2500,[['k1',1900,2500],['k2',2000,1500],['k3',2100,2500]])), r=hoch(dip,[tall(1700)]).dk;
        chk('kueche: Knick zwischen den Kanten des Teils – die niedrigste Decke über dem Teil zählt, nicht nur die Enden',
          r.length===1 && /Decke dort 1500 mm/.test(r[0].txt) && hoch(dip,[tall(100)]).dk.length===0);
      }
      {
        // Teil in Gegenrichtung (a=B, b=A, x ab B): der Knick liegt 1000 ab A, also 3000 ab B.
        // Auch ein ab B gespeicherter Knick (a=B, b=A, x=3000) ist derselbe Punkt.
        const rv=dE(hz(2500,[['k1',1000,1500]])), hit=hoch(rv,[tall(2700,{a:'B',b:'A'})]).dk, fern=hoch(rv,[tall(0,{a:'B',b:'A'})]).dk;
        chk('kueche: Wand in Gegenrichtung – Knick wird ab Ecke B gezählt (Teil darüber rot, Teil in der hohen Ecke nicht)',
          hit.length===1 && /Decke dort 1500 mm/.test(hit[0].txt) && fern.length===0
          && hoch(dE(hz(2500,[['k1',3000,1500,'B','A']])),[tall(700)]).dk.length===1
          && !!KX.ceilAt && near(KX.ceilAt(rv,KX.wallFrame(rv,'B','A'),3000),1500,1e-6) && near(KX.ceilAt(rv,KX.wallFrame(rv,'A','B'),1000),1500,1e-6));
      }
      chk('kueche: Decke ohne Knick unverändert – Trapez aus den Eckhöhen (2400 / 2800), niedrigste Stelle am Teil',
        (()=>{ const tz=dE([{kind:'h',at:'A',d:2400},{kind:'h',at:'B',d:2800},{kind:'h',at:'C',d:2800},{kind:'h',at:'D',d:2400}]), a=hoch(tz,[tall(0,{h:2450})]).dk, b=hoch(tz,[tall(3400,{h:2750})]).dk;
          return a.length===1 && /Decke dort 2400 mm/.test(a[0].txt) && b.length===1 && /Decke dort 2740 mm/.test(b[0].txt) && hoch(tz,[tall(3400,{h:2700})]).dk.length===0; })());
      {
        // Abhilfe des zu niedrigen Geräte-Hochschranks rechnet mit derselben Decke.
        const abh=(h)=>{ const r=hoch(dE(hz(2500,[['k1',2000,h]])),[{id:1,kind:'tall',dev:'dw',a:'A',b:'B',x:1700,w:600,h:1200}]); return r.F.find(f=>/zu niedrig für das Gerät/.test(f.txt)); };
        const f1=abh(1300), f2=abh(1400);
        chk('kueche: Hochschrank zu niedrig für das Gerät unter einer Kehle – Abhilfe nur, wenn die nötige Höhe (1330) unter die niedrigste Decke passt',
          !!f1 && f1.fix===null && !!f2 && !!f2.fix && f2.fix.set && f2.fix.set.h===1330);
      }
      {
        // 3D: Streifen der Wand werden an den Knicken geteilt, Oberkante folgt der Decke.
        const onAB=q=>Math.abs(q.a.y)<1e-6 && Math.abs(q.b.y)<1e-6, capAB=c=>Math.abs(c.poly[0].y)<1e-6 && Math.abs(c.poly[1].y)<1e-6;
        const WG=KX.wallFaces(gi), qa=WG.quads.filter(onAB).sort((p,q)=>p.a.x-q.a.x), ca=WG.caps.filter(capAB).sort((p,q)=>p.poly[0].x-q.poly[0].x);
        chk('kueche: 3D – Giebelwand hat den Knick in der Oberkante (Streifen und Kantenstreifen an x = 2000 geteilt, 1800 → 3000 → 1800)',
          qa.length===2 && near(qa[0].b.x,2000,1e-6) && near(qa[1].a.x,2000,1e-6)
          && near(qa[0].z1a,1800,1e-6) && near(qa[0].z1b,3000,1e-6) && near(qa[1].z1a,3000,1e-6) && near(qa[1].z1b,1800,1e-6)
          && ca.length===2 && near(ca[0].za,1800,1e-6) && near(ca[0].zb,3000,1e-6) && near(ca[1].za,3000,1e-6) && near(ca[1].zb,1800,1e-6)
          && WG.caps.length===5);
        const hmw=hz(1800,[['k1',2000,3000]]), Ew=dE(hmw,[win]), shw=globalThis.wallShape(R.pts,hmw,'A','B'), qw=KX.wallFaces(Ew).quads.filter(onAB);
        chk('kueche: 3D – Giebelwand mit Fenster: kein Streifen läuft über den Knick, keiner ragt über die Decke, der Giebel steht bei 3000',
          qw.length===6 && qw.every(q=>q.b.x<=2000+1e-6 || q.a.x>=2000-1e-6)
          && qw.every(q=>q.z1a<=globalThis.ceilingAt(shw,q.a.x)+1e-6 && q.z1b<=globalThis.ceilingAt(shw,q.b.x)+1e-6)
          && near(Math.max(...qw.map(q=>Math.max(q.z1a,q.z1b))),3000,1e-6));
      }
      {
        // Säule (Wand-Insel) mit Knick in einer ihrer Wände: der Deckel bekommt ihn als Ecke.
        const Q=[['A',0,0],['B',6000,0],['C',6000,4000],['D',0,4000],['I',2800,1800],['J',3200,1800],['K',3200,2200],['L',2800,2200]].map(([id,x,y])=>({id,x,y}));
        const hmq=[{kind:'h',at:'A',d:2500},{kind:'k',id:'k1',a:'I',b:'J',x:100,d:3200,on:true}];
        const TP=KX.wallFaces(KX.makeEnv(Q,[['A','B'],['B','C'],['C','D'],['D','A'],['I','J'],['J','K'],['K','L'],['L','I']],[],hmq)).tops[0];
        chk('kueche: 3D – Säule mit Knick in einer Wand: Deckel hat den Knickpunkt (3200 auf I–J, 100 ab I) als fünfte Ecke, die vier Ecken bleiben 2500',
          !!TP && TP.length===5 && TP.filter(p=>near(p.z,2500,1e-6)).length===4 && TP.some(p=>near(p.z,3200,1e-6) && near(p.x,2900,1e-6) && near(p.y,1800,1e-6)));
      }
      {
        // Hängeschrank nie unter dem Boden: Hochschrank 1000 + Hängeschrank 1400 liegen beide in K_LIM.
        const nk=s=>KX.normKitchen({spec:s}), Kw=KX.normKitchen({spec:{plinth:0,tallH:1000,wallH:1400},items:[{id:1,kind:'wall',a:'A',b:'B',x:1000,w:600}]});
        chk('kueche: Hängeschrank beginnt nie unter dem Boden (Hochschrank 1000, Hängeschrank 1400: Unterkante 0 statt −400)',
          KX.derived(Kw.spec).wallZ===0 && KX.dims(Kw,Kw.items[0]).z0===0 && KX.dims(Kw,Kw.items[0]).z1===1400
          && [0,300].every(p=>[1000,2800].every(t=>[200,1400].every(w=>KX.derived(nk({plinth:p,tallH:t,wallH:w}).spec).wallZ>=0))));
        chk('kueche: Hängeschrank bündig mit dem Hochschrank, wo er hineinpasst (Unterkante = Oberkante Hochschrank − Höhe)',
          [{plinth:150,tallH:1000,wallH:720},{plinth:0,tallH:2016,wallH:900}].every(s=>{ const S=nk(s).spec, D=KX.derived(S); return D.wallZ===D.tallTop-S.wallH && D.wallZ>0; }));
      }
      {
        // Spülmaschine oder Backofen im niedrigen Hochschrank (devZ fest): der Befund ist da, nicht stumm.
        const low=(dev,h)=>hoch(dE([]),[{id:1,kind:'tall',dev,a:'A',b:'B',x:1000,w:600,h}]).F.filter(f=>/Hochschrank zu niedrig für das Gerät/.test(f.txt));
        chk('kueche: Spülmaschine und Backofen im Hochschrank von 1000 oder 1200 mm – "zu niedrig für das Gerät" rot',
          [['dw',1200],['dw',1000],['oven',1200],['oven',1000]].every(([d,h])=>{ const r=low(d,h); return r.length===1 && r[0].lvl==='bad'; }));
      }
    }catch(err){ chk('kueche: Review-Fix Rest: decke ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: eck ---
    try{
      // Eckschränke und Türschwenk (Review-Befunde eck B1–B5). Eigene Räume, damit Fenster
      // und Tür des Testraums oben nicht stören; je Befund ein eigener Test, damit ein Fehler
      // die übrigen nicht verdeckt.
      const T=(n,f)=>{ try{ chk(n, !!f()); }catch(err){ chk(n+' ('+err.message+')', false); } };
      const rE=(w,h,open)=>{ const Rr=rect(w,h); return KX.makeEnv(Rr.pts,Rr.walls,open||[],[]); };
      const E0=rE(4000,3000);
      // B1: doorReach prüft auch den zweiten Schenkel (wing) eines L-Eckschranks; das Hauptteil
      // deckt dort nur seine eigene Wand.
      T('kueche-eck: Zimmertür schwenkt nicht durch den zweiten Schenkel eines L-Eckschranks – 94°, nicht 114°', ()=>{
        const rd=(hinge,ctype)=>{ const d={id:'o2',kind:'door',a:'A',b:'B',x:1000,w:900,y:0,h:2000,swing:{type:'turn',hinge,out:false}};
          const E1=KX.makeEnv(R.pts,R.walls,[d],[]), K1=KX.normKitchen({items:[{id:1,kind:'base',corner:true,ctype,front:'door',cEnd:0,a:'A',b:'D',x:0,w:900}]}), L1=KX.layout(E1,K1);
          return {rc:KX.doorReach(E1,L1).get('o2'), F:KX.check(E1,K1,L1), L:L1, s:globalThis.doorSwing(E1.pts,E1.walls,d)}; };
        const l=rd('left','L'), dg=rd('left','diag'), lr=rd('right','L'), wg=l.L.G.find(h=>h.wing);
        // unabhängige Probe: das Blatt (900 × 40) bei 96° liegt im zweiten Schenkel, bei 94° nicht
        const leaf=a=>{ const s=l.s, th=s.dir0+s.sense*a*Math.PI/180, u={x:Math.cos(th),y:Math.sin(th)}, v={x:-s.sense*u.y,y:s.sense*u.x}, P0=s.angel;
          const P1={x:P0.x+u.x*900,y:P0.y+u.y*900}; return [P0,P1,{x:P1.x+v.x*40,y:P1.y+v.y*40},{x:P0.x+v.x*40,y:P0.y+v.y*40}]; };
        return !!wg && l.rc.deg===94 && l.rc.hit==='Eckschrank 90' && l.rc.hitId===1
          && TILES.convexOverlap(leaf(96), wg.poly, 1) && !TILES.convexOverlap(leaf(94), wg.poly, 1)
          && has(l.F,/Zimmertür geht 94° auf, dann stößt sie an Eckschrank 90/,'info')
          && dg.rc.deg===94 && lr.rc.deg===lr.rc.maxDeg && !lr.rc.hit;      // diagonal wie bisher (Fünfeck), Angel rechts frei
      });
      // B2: ⌘C lässt die gesetzte Ecke weg – sie gilt nur an der Wand, an der der Schrank stand.
      T('kueche-eck: Kopiervorlage ohne Lage und ohne gesetzte Ecke, tiefe Kopie', ()=>{
        const o={id:7,kind:'base',corner:true,ctype:'L',inner:'karussell',front:'door',cEnd:1,a:'A',b:'B',x:3100,y:5,w:900,store:['toepfe']};
        const c=KX.clipItem(o); c.store.push('putz');
        return !['id','a','b','x','y','cEnd'].some(k=>k in c) && c.corner===true && c.ctype==='L' && c.inner==='karussell' && c.w===900
          && o.cEnd===1 && o.id===7 && o.store.length===1;
      });
      T('kueche-eck: Einfügen setzt einen Eckschrank mit gesetzter Ecke B unter den Zeiger an Ecke A (Halbeck, über Eck, diagonal)', ()=>{
        return [{w:1000},{ctype:'L',w:900},{ctype:'diag',w:900}].every(extra=>{
          const o={id:1,kind:'base',corner:true,front:'door',cEnd:1,a:'A',b:'B',...extra}; o.x=4000-o.w;
          const K2=KX.normKitchen({items:[o]}), L2=KX.layout(E0,K2), it={...KX.clipItem(K2.items[0]), id:K2.seq++};
          const nw=KX.nearestWall(E0,{x:150,y:300},0,null,it.w), Wf=nw.Wf;          // Zeiger neben Ecke A an der Wand A–D
          const nr=KX.snapX(E0,K2,L2,{...it,a:Wf.a,b:Wf.b},Wf,nw.s-it.w/2,140);
          it.a=Wf.a; it.b=Wf.b;
          const sl=KX.placeOnWall(E0,K2,L2,it,Wf,nr,false);
          return Wf.key==='A|D' && !!sl && near(sl.x,0,0.5);
        });
      });
      // B3: die gesetzte Ecke folgt dem Eckschrank an das andere Wandende (Rastkante).
      T('kueche-eck: Halbeck mit gesetzter Ecke an die andere Ecke gezogen – Ecke folgt, Blende und Tür auf der richtigen Seite', ()=>{
        const Wf=KX.wallFrame(E0,'A','B'), row=[{id:2,kind:'base',a:'B',b:'C',x:630,w:600,front:'drawer'},{id:3,kind:'base',a:'B',b:'C',x:1230,w:600,front:'drawer'}];
        const K3=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',cEnd:0,a:'A',b:'B',x:0,w:1000},...row]}), it=K3.items[0];
        let L3=KX.layout(E0,K3);
        const xB=KX.cornerPlace(E0,K3,L3,{...it,cEnd:1},Wf);          // die Rastkante, auf der kitchenMove einrastet
        it.x=xB;
        const r=KX.cornerDrop(E0,K3,L3,it,Wf,true);
        if(!(near(xB,3000,0.5) && r && r.cEnd===1 && near(r.x,xB,0.01))) return false;
        it.cEnd=r.cEnd; it.x=r.x; L3=KX.layout(E0,K3);
        const g=L3.byId.get(1), cb=KX.cornerBlind(g,K3.spec), sx=g.env.flatMap(e=>e.poly.map(p=>p.x));
        return !!cb && !cb.atS0 && Math.min(...sx)>=2990 && Math.max(...sx)<=3400;      // vor der Querzeile (nicht 3630…4000 dahinter)
      });
      T('kueche-eck: Halbeck an kurzer Wand – die gesetzte Ecke bleibt auf der eigenen Eckenlage und bei kleinem Zug, nur die andere Eckenlage ändert sie', ()=>{
        const E4=rE(1200,3000), Wf=KX.wallFrame(E4,'A','B');
        // UE100-50 an Ecke A: Blende 500 hinter der 580 tiefen Querzeile + 50 Passblende = 130 von der Ecke
        const K4=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',door:500,cEnd:0,a:'A',b:'B',x:0,w:1000},{id:2,kind:'base',a:'A',b:'D',x:630,w:600,front:'drawer'}]}), it=K4.items[0], L4=KX.layout(E4,K4);
        const xA=KX.cornerPlace(E4,K4,L4,it,Wf), xB=KX.cornerPlace(E4,K4,L4,{...it,cEnd:1},Wf);
        const at=(x,snap,pin)=>{ const t={...it,x}; if(pin===null) delete t.cEnd; return KX.cornerDrop(E4,K4,L4,t,Wf,snap); };
        // Nähe zur Ecke zeigt hier auf B (Abstand 70 statt 130 mm), die Eckenlage nicht
        const nearerB=Wf.L-xA-it.w < xA;
        return near(xA,130,0.5) && near(xB,200,0.5) && nearerB
          && at(xA,true)===null && at(xA-5,true)===null && at(xA,false)===null           // bleibt A
          && (at(xB,true)||{}).cEnd===1 && near((at(xB,true)||{}).x,xB,0.01) && (at(xB,false)||{}).cEnd===1  // exakt auf B: folgt, auch mit ⌥
          && at(xB,true,null)===null;                                                       // ohne gesetzte Ecke nichts zu tun
      });
      // Der übliche Endpunkt des Ziehens ist bündig am Wandende; die Eckenlage hinter der Querzeile
      // (Blende + Querzeile + Passblende) liegt davon weg, sobald die Blende kürzer ist als die Querzeile.
      T('kueche-eck: Halbeck bündig ans andere Wandende gezogen – Ecke folgt und rückt in die Eckenlage (Korpus 90, feste Türen)', ()=>{
        const Wf=KX.wallFrame(E0,'A','B'), row=[{id:2,kind:'base',a:'B',b:'C',x:630,w:600,front:'drawer'},{id:3,kind:'base',a:'B',b:'C',x:1230,w:600,front:'drawer'}];
        let weit=0;
        const ok=[{w:1000},{w:900},{w:1000,door:500},{w:1000,door:600},{w:900,door:400},{w:900,door:450}].every(extra=>{
          const K3=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',cEnd:0,a:'A',b:'B',x:0,w:1000,...extra},...row]}), it=K3.items[0], L3=KX.layout(E0,K3);
          const flush=4000-it.w, xB=KX.cornerPlace(E0,K3,L3,{...it,cEnd:1},Wf);
          if(xB<flush-1) weit++;                                          // Eckenlage ≠ bündig: hier versagt der Rastpunkt allein
          it.x=flush;                                                     // Cursor über das Wandende hinaus: klemmt bündig
          const r=KX.cornerDrop(E0,K3,L3,it,Wf,true), ra=KX.cornerDrop(E0,K3,L3,it,Wf,false);
          if(!(r && r.cEnd===1 && near(r.x,xB,0.01) && ra && ra.cEnd===1 && near(ra.x,flush,0.01))) return false;      // ⌥ ändert die Lage nicht
          it.cEnd=r.cEnd; it.x=r.x;
          const L4=KX.layout(E0,K3), g=L4.byId.get(1), cb=KX.cornerBlind(g,K3.spec), sx=g.env.filter(e=>e.what==='Tür').flatMap(e=>e.poly.map(p=>p.x));
          // Blende zur Ecke B, Tür davor (nicht dahinter in 3630…4000), keine Warnung und kein roter Befund
          return !!cb && !cb.atS0 && sx.length>0 && Math.max(...sx)<=3420+1 && !KX.check(E0,K3,L4).some(f=>f.ids.includes(1) && f.lvl!=='info');
        });
        return ok && weit===5;
      });
      // Zwischenlagen: ein Zug, der nicht auf einer Rastkante endet (zu weit gezoomt, ⌥, Pfeiltasten), liegt
      // zwischen bündig und der Mitte. Im Bereich bis zur Eckenlage ist die Blende zu kurz: er rückt hinein
      // (⌥: bleibt). Davor, solange die Querzeile vor seiner Front steht (< Tiefe 580 + Passblende), gehört die
      // Blende trotzdem auf ihre Seite; die Lage bleibt, jeder größere Abstand ist gültig.
      T('kueche-eck: Halbeck zwischen bündig und Mitte abgelegt – im Bereich der Eckenlage rückt er hinein, davor kippt nur die Ecke', ()=>{
        const Wf=KX.wallFrame(E0,'A','B'), row=[{id:2,kind:'base',a:'B',b:'C',x:630,w:600,front:'drawer'},{id:3,kind:'base',a:'B',b:'C',x:1230,w:600,front:'drawer'}];
        const K3=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',door:500,cEnd:0,a:'A',b:'B',x:0,w:1000},...row]}), it=K3.items[0], L3=KX.layout(E0,K3);
        const at=(x,snap)=>KX.cornerDrop(E0,K3,L3,{...it,x},Wf,snap);       // Eckenlage 2870, bündig 3000, Querzeile vor der Front ab x > 2370
        const a=at(2940,true), b=at(2940,false), c=at(2870,true);
        const stay=[2860,2500,2380].every(x=>[true,false].every(sn=>{ const r=at(x,sn); return !!r && r.cEnd===1 && near(r.x,x,0.01); }));
        return near(KX.cornerPlace(E0,K3,L3,{...it,cEnd:1},Wf),2870,0.5)
          && !!a && a.cEnd===1 && near(a.x,2870,0.01) && !!b && b.cEnd===1 && near(b.x,2940,0.01)         // im Bereich: in die Eckenlage, mit ⌥ bleibt die Lage
          && !!c && c.cEnd===1 && near(c.x,2870,0.01)
          && stay                                                                                         // davor: Ecke kippt, Lage bleibt
          && at(2370,true)===null && at(2370,false)===null && at(1500,true)===null && at(0,true)===null;    // Querzeile nicht mehr vor der Front, Wandmitte, eigene Ecke
      });
      T('kueche-eck: Halbeck zwischen bündig und Mitte – nach dem Kippen Blende zur Ecke, Tür davor, kein roter Befund und keine Warnung', ()=>{
        const Wf=KX.wallFrame(E0,'A','B'), row=[{id:2,kind:'base',a:'B',b:'C',x:630,w:600,front:'drawer'},{id:3,kind:'base',a:'B',b:'C',x:1230,w:600,front:'drawer'}];
        return [[{w:1000},2910],[{w:900},3010],[{w:1000,door:500},2500],[{w:1000,door:600},2700],[{w:900,door:400},2600]].every(([extra,x])=>{
          const K3=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',cEnd:0,a:'A',b:'B',x,w:1000,...extra},...row]}), it=K3.items[0];
          const L3=KX.layout(E0,K3), r=KX.cornerDrop(E0,K3,L3,it,Wf,true);
          if(!(r && r.cEnd===1 && near(r.x,x,0.01))) return false;
          const bef=KX.cornerBlind(L3.byId.get(1),K3.spec);                                              // vorher: Blende zur Wandmitte (A), Tür hinter der Querzeile
          it.cEnd=r.cEnd; it.x=r.x;
          const L4=KX.layout(E0,K3), g=L4.byId.get(1), cb=KX.cornerBlind(g,K3.spec), sx=g.env.filter(e=>e.what==='Tür').flatMap(e=>e.poly.map(p=>p.x));
          return !!bef && bef.atS0 && !!cb && !cb.atS0 && sx.length>0 && Math.max(...sx)<=3420+1 && !KX.check(E0,K3,L4).some(f=>f.ids.includes(1) && f.lvl!=='info');
        });
      });
      T('kueche-eck: Halbeck an kurzer Wand mit Querzeile an beiden Enden – überlappen die Bereiche, entscheidet die Rastkante (wie bisher)', ()=>{
        const E5=rE(1200,3000), Wf=KX.wallFrame(E5,'A','B');
        const mk=pin=>{ const K=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',door:500,cEnd:pin,a:'A',b:'B',x:0,w:1000},{id:2,kind:'base',a:'A',b:'D',x:630,w:600,front:'drawer'},{id:3,kind:'base',a:'B',b:'C',x:630,w:600,front:'drawer'}]}); return {K,it:K.items[0],L:KX.layout(E5,K)}; };
        const a=mk(0), b=mk(1), at=(s,x)=>KX.cornerDrop(E5,s.K,s.L,{...s.it,x},Wf,true);
        // Eckenlagen: A bei 130, B bei 70; dazwischen (70…130) liegt er in beiden Bereichen
        return near(KX.cornerPlace(E5,a.K,a.L,a.it,Wf),130,0.5) && near(KX.cornerPlace(E5,a.K,a.L,{...a.it,cEnd:1},Wf),70,0.5)
          && (at(a,70)||{}).cEnd===1 && at(a,100)===null && at(a,130)===null
          && (at(b,130)||{}).cEnd===0 && at(b,100)===null && at(b,70)===null;
      });
      T('kueche-eck: Halbeck an kurzer Wand mit Querzeile an beiden Enden – bündig am Wandende gehört er der Ecke, an der er steht', ()=>{
        const E5=rE(1200,3000), Wf=KX.wallFrame(E5,'A','B');
        const mk=pin=>{ const K=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',door:500,cEnd:pin,a:'A',b:'B',x:0,w:1000},{id:2,kind:'base',a:'A',b:'D',x:630,w:600,front:'drawer'},{id:3,kind:'base',a:'B',b:'C',x:630,w:600,front:'drawer'}]}); return {K,it:K.items[0],L:KX.layout(E5,K)}; };
        const a=mk(0), b=mk(1), at=(s,x,snap)=>KX.cornerDrop(E5,s.K,s.L,{...s.it,x},Wf,snap);
        const e1=at(a,200,true), e2=at(a,200,false), e3=at(b,0,true), e4=at(b,0,false);
        return !!e1 && e1.cEnd===1 && near(e1.x,70,0.01) && !!e2 && e2.cEnd===1 && near(e2.x,200,0.01)        // B: in die Eckenlage, mit ⌥ bleibt die Lage
          && !!e3 && e3.cEnd===0 && near(e3.x,130,0.01) && !!e4 && e4.cEnd===0 && near(e4.x,0,0.01)           // A ebenso
          && at(a,0,true)===null && at(b,200,true)===null;                                                      // an der eigenen Ecke bleibt es
      });
      T('kueche-eck: Halbeck zwischen zwei Querzeilen – verdecken beide die Front, bleibt die Ecke; ab dort, wo nur eine sie verdeckt, kippt sie', ()=>{
        const E6=rE(1900,3000), Wf=KX.wallFrame(E6,'A','B');
        const mk=pin=>{ const K=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',door:500,cEnd:pin,a:'A',b:'B',x:0,w:1000},{id:2,kind:'base',a:'A',b:'D',x:630,w:600,front:'drawer'},{id:3,kind:'base',a:'B',b:'C',x:630,w:600,front:'drawer'}]}); return {K,it:K.items[0],L:KX.layout(E6,K)}; };
        const a=mk(0), b=mk(1), at=(s,x,snap)=>KX.cornerDrop(E6,s.K,s.L,{...s.it,x},Wf,snap);
        // Wand 1900, Schrank 1000: x 0…900. Beide Querzeilen stehen vor der Front für x 280…620; Eckenlagen A 130, B 770
        const up=at(a,700,true), dn=at(b,200,true);
        return at(a,100,true)===null && at(a,400,true)===null && at(a,400,false)===null && at(b,400,true)===null && at(b,800,true)===null
          && !!up && up.cEnd===1 && near(up.x,700,0.01) && !!dn && dn.cEnd===0 && near(dn.x,200,0.01);
      });
      // Pfeiltasten schieben in kleinen Schritten, ohne Einrasten: dieselbe Funktion (snap aus) nimmt nur die Ecke mit.
      T('kueche-eck: Halbeck Schritt für Schritt über die Wand geschoben (Pfeiltasten, ohne Einrasten) – Ecke kippt vor der Querzeile, die Lage bleibt', ()=>{
        const Wf=KX.wallFrame(E0,'A','B'), row=[{id:2,kind:'base',a:'B',b:'C',x:630,w:600,front:'drawer'},{id:3,kind:'base',a:'B',b:'C',x:1230,w:600,front:'drawer'}];
        const K3=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',door:500,cEnd:0,a:'A',b:'B',x:0,w:1000},...row]}), it=K3.items[0], L3=KX.layout(E0,K3);
        const run=st=>{                                            // hin und zurück mit Schrittweite st (Pfeil 10 mm, ⇧Pfeil 100 mm), am Ende geklemmt
          let cur=0, moved=false; const flips=[], max=Wf.L-it.w;
          const at=x=>{ const r=KX.cornerDrop(E0,K3,L3,{...it,cEnd:cur,x},Wf,false); if(r){ flips.push([x,r.cEnd]); cur=r.cEnd; if(r.x!==x) moved=true; } };
          for(let x=0;;x=Math.min(max,x+st)){ at(x); if(x===max) break; }
          for(let x=max;;x=Math.max(0,x-st)){ at(x); if(x===0) break; }
          return {flips:JSON.stringify(flips), moved, cur};
        };
        const a=run(10), b=run(100);       // kippt, sobald die Querzeile vor der Front steht (Abstand < 580 + 50): 2380 bzw. 2400; zurück erst an der Ecke A
        return a.flips==='[[2380,1],[0,0]]' && b.flips==='[[2400,1],[0,0]]' && !a.moved && !b.moved && a.cur===0 && b.cur===0;
      });
      T('kueche-eck: Eckschrank über Eck nach dem Ziehen – bündig in die nähere Ecke, mit ⌥ bleibt die Lage', ()=>{
        const Wf=KX.wallFrame(E0,'A','B'), K5=KX.normKitchen({items:[{id:1,kind:'base',corner:true,ctype:'L',front:'door',cEnd:0,a:'A',b:'B',x:3050,w:900}]}), it=K5.items[0], L5=KX.layout(E0,K5);
        const r=KX.cornerDrop(E0,K5,L5,it,Wf,true), ra=KX.cornerDrop(E0,K5,L5,it,Wf,false);
        return !!r && r.cEnd===1 && near(r.x,3100,0.5) && ra===null;
      });
      // B4: passt der Eckschrank nur geschrumpft, gilt die Eckenlage der kleineren Breite.
      T('kueche-eck: Eckschrank aus der Leiste nur geschrumpft – Lage der kleineren Breite, Blende hinter der Querzeile', ()=>{
        const items=[{id:1,kind:'base',a:'A',b:'D',x:630,w:600},{id:2,kind:'base',a:'A',b:'D',x:1230,w:600}];     // Querzeile an A–D
        for(let x=960,i=3;x+600<=4000;x+=600,i++) items.push({id:i,kind:'base',a:'A',b:'B',x,w:600});             // Zeile A–B ab 960
        const K6=KX.normKitchen({items}), L6=KX.layout(E0,K6), Wf=KX.wallFrame(E0,'A','B'), pre=KX.PRESETS.find(p=>p.key==='corner');
        const it={id:K6.seq++, kind:pre.kind, w:pre.w, corner:true, front:'door', a:Wf.a, b:Wf.b};
        const sl=KX.placeOnWall(E0,K6,L6,it,Wf,null,true);
        if(!sl || sl.w!==900 || KX.placeOnWall(E0,K6,L6,it,Wf,null,false)!==null) return false;      // geschrumpft auf 90; Einfügen (ohne shrink) findet nichts
        K6.items.push(KX.normItem({...it,w:sl.w,x:sl.x}));
        const g=KX.layout(E0,K6).byId.get(it.id), cb=KX.cornerBlind(g,K6.spec);
        return near(sl.x,30,0.5) && !!cb && cb.atS0 && !!g.cross && sl.x+cb.b>=g.cross.d+50-0.5;     // Tür beginnt 50 mm vor der Front der Querzeile
      });
      T('kueche-eck: Platz für die Standardbreite – Lage und Breite wie bisher (Eckschrank und normaler Schrank)', ()=>{
        const Wf=KX.wallFrame(E0,'A','B'), K7=KX.normKitchen({items:[]}), L7=KX.layout(E0,K7);
        const pre=KX.PRESETS.find(p=>p.key==='corner'), it={id:1, kind:pre.kind, w:pre.w, corner:true, front:'door'};
        const a=KX.placeOnWall(E0,K7,L7,it,Wf,null,true), b=KX.placeOnWall(E0,K7,L7,it,Wf,3500,true);
        // normaler Schrank, Zeile voll bis auf Lücken von 500 mm: größte Rasterbreite darunter, bei near
        const fill=[{id:1,kind:'base',a:'A',b:'B',x:0,w:600}];
        for(let x=1100,i=2;x+600<=4000;x+=600,i++) fill.push({id:i,kind:'base',a:'A',b:'B',x,w:600});
        const K8=KX.normKitchen({items:fill}), L8=KX.layout(E0,K8);
        const c=KX.placeOnWall(E0,K8,L8,{id:99,kind:'base',w:600,front:'drawer'},Wf,600,true);
        return !!a && a.w===1000 && near(a.x,0,0.5) && !!b && b.w===1000 && near(b.x,3000,0.5) && !!c && c.w===500 && near(c.x,600,0.5);
      });
      // B5: Front ≠ Drehtür macht den Eckschrank vollständig zum normalen Schrank.
      T('kueche-eck: Front auf Schubladen – keine Reste von Bauart, Ecke, Innenleben und Tür; Sitzung = nach dem Neuladen', ()=>{
        return [{ctype:'diag',hinge:'left',w:900},{ctype:'L',inner:'karussell',w:900},{door:500,inner:'schub',w:1000},{kind:'wall',ctype:'diag',hinge:'left',w:650},{kind:'wall',door:350,w:782}].every(extra=>{
          const t=KX.normKitchen({items:[{id:1,kind:'base',corner:true,front:'door',cEnd:0,a:'A',b:'D',x:0,...extra}]}).items[0];
          KX.frontSet(t,'drawer');
          const rl=KX.normItem(JSON.parse(JSON.stringify(t)));
          const same=Object.keys(t).sort().join()===Object.keys(rl).sort().join();
          KX.frontSet(t,'door');                                    // zurück auf Drehtür: ein normaler Schrank, auch ohne Anschlag
          return same && !t.corner && !t.ctype && !('cEnd' in t) && !('inner' in t) && !('door' in t) && !KX.hasHinge(t);
        });
      });
      T('kueche-eck: Front „Drehtür“ lässt den Eckschrank, wie er ist; „Normaler Schrank“ räumt genauso auf', ()=>{
        const mk=()=>KX.normKitchen({items:[{id:1,kind:'base',corner:true,ctype:'L',inner:'karussell',front:'door',cEnd:1,a:'A',b:'D',x:0,w:900}]}).items[0];
        const a=mk(), s0=JSON.stringify(a); KX.frontSet(a,'door');
        const b=mk(), c=mk(); KX.clearCorner(b); KX.frontSet(c,'open'); c.front='door';
        return JSON.stringify(a)===s0 && a.corner===true && a.ctype==='L' && JSON.stringify(b)===JSON.stringify(c) && !('ctype' in b) && !('cEnd' in b);
      });
    }catch(err){ chk('kueche: Review-Fix Rest: eck ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: masskette ---
    try{
      // Maßkette und Wandabstände (Befunde C1-C7 der Gegenprüfung). Raum 4000 × 3000.
      const E0=KX.makeEnv(R.pts,R.walls,[],[]);
      const kl=(Ex,items)=>{ const K=KX.normKitchen({items}), L=KX.layout(Ex,K); return {K,L}; };
      const chain=(Ex,r,id)=>KX.chainDims(Ex,r.L,r.L.byId.get(id),r.K);
      const badF=(Ex,r)=>KX.check(Ex,r.K,KX.layout(Ex,r.K)).filter(f=>f.lvl==='bad').map(f=>f.txt);
      // C1: Block mit dem Hauptteil eines Eckschranks über Eck / diagonal hängt in der Ecke fest
      [['L',0],['L',1],['diag',0],['diag',1]].forEach(([ct,ce])=>{
        const r=kl(E0, ce===0 ? [{id:1,kind:'base',corner:true,ctype:ct,hinge:'left',cEnd:0,a:'A',b:'B',x:0,w:900},{id:2,kind:'base',a:'A',b:'B',x:900,w:600}]
                              : [{id:1,kind:'base',corner:true,ctype:ct,hinge:'left',cEnd:1,a:'A',b:'B',x:3100,w:900},{id:2,kind:'base',a:'A',b:'B',x:2500,w:600}]);
        const edits=[2,1].flatMap(id=>chain(E0,r,id).segs.filter(s=>s.edit));
        chk(`kueche-masskette: Eckschrank ${ct==='L'?'über Eck':'diagonal'} in Ecke ${ce?'B':'A'} – Block mit dem Hauptteil ohne Eingabefeld, nichts zu verschieben`,
          edits.length===0 && badF(E0,r).length===0);
      });
      {
        // Mit Lücke zum Eckschrank bleibt das Feld, begrenzt vom Eckschrank (bündig), und bewegt ihn nicht
        const r=kl(E0,[{id:1,kind:'base',corner:true,ctype:'L',cEnd:0,a:'A',b:'B',x:0,w:900},{id:3,kind:'base',a:'A',b:'B',x:1500,w:600}]);
        const last=chain(E0,r,3).segs.find(s=>s.edit);
        chk('kueche-masskette: Block ohne Eckschrank bleibt verstellbar, bis zum Eckschrank (bündig)',
          !!last && !last.edit.ids.includes(1) && near(last.edit.cur,1900,0.5) && near(last.edit.max,2500,0.5));
        // ein altes Feld mit dem Eckschrank im Block (vor dem Fix angeboten) setzt applyDim nicht um
        const r2=kl(E0,[{id:1,kind:'base',corner:true,ctype:'L',cEnd:0,a:'A',b:'B',x:0,w:900},{id:2,kind:'base',a:'A',b:'B',x:900,w:600}]);
        const old={ids:[2,1], fa:'A', side:1, cur:2500, min:0, max:2500};
        chk('kueche-masskette: ein Block mit dem Eckschrank wird auch mit einem alten Feld nicht verschoben',
          !KX.applyDim(E0,r2.K,old,2000) && r2.K.items[0].x===0 && r2.K.items[1].x===900 && KX.dimCheck(E0,r2.K,old,2000).why==='fit' && badF(E0,r2).length===0);
      }
      // C2: der Hochschrank belegt das Hängeschrankband und steht in dessen Zeile
      {
        const r=kl(E0,[{id:1,kind:'tall',a:'A',b:'B',x:0,w:600},{id:2,kind:'wall',a:'A',b:'B',x:600,w:600}]);
        const cd=chain(E0,r,2), s0=cd.segs[0];
        chk('kueche-masskette: Hängeschrank neben dem Hochschrank – die Kette zeigt ihn als Teil, nicht als Wandabstand ohne Grenze',
          s0.part===1 && !s0.gap && !s0.edit && !cd.segs.some(s=>s.gap && s.a<600));
        const r2=kl(E0,[{id:1,kind:'wall',a:'A',b:'B',x:0,w:600},{id:2,kind:'tall',a:'A',b:'B',x:600,w:600}]);
        const f=chain(E0,r2,2).segs[0];
        chk('kueche-masskette: Hochschrank neben dem Hängeschrank lässt sich nicht in ihn hineinschieben',
          !!f.edit && near(f.edit.min,600,0.5) && !KX.applyDim(E0,r2.K,f.edit,0) && r2.K.items[1].x===600 && badF(E0,r2).length===0);
        // Hängezeile: der Hochschrank ist Anker (wie das Wandende). Kein Feld verschiebt ihn dort - das tut seine eigene
        // Zeile mit ihren Sperren; die Lücke am Hochschrank verstellt den Hängeschrank daneben, bündig bis an ihn.
        const r3=kl(E0,[{id:1,kind:'tall',a:'A',b:'B',x:600,w:600},{id:2,kind:'base',a:'A',b:'B',x:1200,w:600},{id:3,kind:'wall',a:'A',b:'B',x:1500,w:600}]);
        const g3=chain(E0,r3,3), gl=g3.segs.find(s=>s.gap && near(s.a,1200,0.5) && near(s.b,1500,0.5));
        chk('kueche-masskette: Hängezeile – der Hochschrank ist Anker: kein Feld verschiebt ihn, die Lücke am Hochschrank verstellt den Hängeschrank (bündig bis 0)',
          !g3.segs[0].edit && !g3.segs.some(s=>s.edit && s.edit.ids.includes(1)) && !!gl && !!gl.edit && gl.edit.ids.length===1 && gl.edit.ids[0]===3
          && gl.edit.anchor===1 && near(gl.edit.cur,300,0.5) && near(gl.edit.min,0,0.5) && near(gl.edit.max,2200,0.5) && gl.edit.wp===null);
        chk('kueche-masskette: Hängezeile – der Wert 0 an der Lücke setzt den Hängeschrank bündig an den Hochschrank, der bleibt stehen, ohne Befund',
          KX.applyDim(E0,r3.K,gl.edit,0) && r3.K.items[2].x===1200 && r3.K.items[0].x===600 && badF(E0,r3).length===0);
        // Nutzersicht-Befund (echte Küche): Dunstabzug neben dem Kühlschrank – das linke Feld verstellt den Dunstabzug, nicht den Kühlschrank
        const rk=kl(E0,[{id:1,kind:'tall',a:'A',b:'B',x:1140,w:900},{id:10,kind:'wall',a:'A',b:'B',x:2490,w:600}]);
        const ck=chain(E0,rk,10), lk=ck.segs.find(s=>s.gap && near(s.a,2040,0.5) && near(s.b,2490,0.5)), rl=ck.segs[ck.segs.length-1];
        chk('kueche-masskette: Hängezeile – Dunstabzug neben dem Kühlschrank: links verstellt das Feld den Dunstabzug (450 mm zum Kühlschrank), das Wandende-Feld den Kühlschrank nicht',
          !!lk && !!lk.edit && lk.edit.ids.length===1 && lk.edit.ids[0]===10 && near(lk.edit.cur,450,0.5) && !ck.segs[0].edit
          && !!rl.edit && rl.edit.ids.length===1 && rl.edit.ids[0]===10);
        chk('kueche-masskette: Hängezeile – Eingabe am Hochschrank schiebt nur den Dunstabzug (Kühlschrank bleibt), eine Lücke zum Hochschrank von 0 mm gibt es nicht mehr als Feld',
          KX.applyDim(E0,rk.K,lk.edit,150) && rk.K.items[1].x===2190 && rk.K.items[0].x===1140 && !chain(E0,rk,10).segs.some(s=>s.gap && s.edit && s.edit.anchor===1 && s.b-s.a<1));
        // Hochschrank im Block der unteren Zeile mit Eckschrank (dort gesperrt): auch aus der Hängezeile nicht verschiebbar
        const rp=kl(E0,[{id:1,kind:'base',corner:true,ctype:'L',cEnd:0,a:'A',b:'B',x:0,w:900},{id:2,kind:'tall',a:'A',b:'B',x:900,w:600},{id:3,kind:'wall',a:'A',b:'B',x:1800,w:600}]);
        chk('kueche-masskette: Hängezeile – ein Hochschrank neben dem Eckschrank (untere Zeile gesperrt) lässt sich aus der Hängezeile nicht verschieben',
          !chain(E0,rp,3).segs.some(s=>s.edit && s.edit.ids.includes(2)) && !chain(E0,rp,3).segs.some(s=>s.edit && s.edit.ids.includes(1)));
        // Mehrere Anker in einer Zeile: jedes Feld hat sein eigenes Maß (Schlüssel), auch nach dem Neuberechnen wiederzufinden
        const rm=kl(E0,[{id:1,kind:'wall',a:'A',b:'B',x:300,w:600},{id:2,kind:'tall',a:'A',b:'B',x:1500,w:600},{id:3,kind:'wall',a:'A',b:'B',x:2400,w:600}]);
        const cm=chain(E0,rm,1), hits=cm.segs.filter(s=>s.edit).map(s=>({edit:s.edit})), keys=hits.map(h=>KX.dimKey(h.edit));
        chk('kueche-masskette: Hängezeile – vier Felder (Wandende, am Hochschrank je Seite, Wandende) haben vier verschiedene Schlüssel, dimResolve findet jedes wieder',
          hits.length===4 && new Set(keys).size===4 && hits.every(h=>KX.dimResolve(hits,h)===h) && hits.map(h=>h.edit.ids[0]).join()==='1,1,3,3');
      }
      // C3: Querzeile der Nachbarwand und Türen begrenzen die Wandabstände, applyDim prüft mit fitsAt
      {
        const c1={id:1,kind:'base',corner:true,front:'door',a:'A',b:'B',x:0,w:1000};
        const k0=kl(E0,[c1]), x=KX.freeSlot(E0,k0.K,k0.L,{id:2,kind:'base',w:600},KX.wallFrame(E0,'A','D'));
        const r=kl(E0,[c1,{id:2,kind:'base',a:'A',b:'D',x,w:600}]), f=chain(E0,r,2).segs[0], dEck=r.L.byId.get(1).d;
        chk('kueche-masskette: Wandabstand an der Nachbarwand – der Eckschrank der Querzeile begrenzt das Feld (bündig an seiner Tiefe)',
          !!f.edit && near(f.edit.min,dEck,1) && badF(E0,r).length===0);
        chk('kueche-masskette: der Wert bis an den Eckschrank wird abgelehnt und lässt nichts überlappen, bündig geht',
          !KX.applyDim(E0,r.K,f.edit,0) && r.K.items[1].x===x && KX.applyDim(E0,r.K,f.edit,f.edit.min) && !badF(E0,r).some(t=>/überlappen/.test(t)));
        const door={id:'o2',kind:'door',a:'A',b:'B',x:1500,w:900,y:0,h:2000,swing:{type:'turn',hinge:'left',out:false}};
        const Ed=KX.makeEnv(R.pts,R.walls,[door],[]), rd=kl(Ed,[{id:1,kind:'base',a:'A',b:'B',x:0,w:600}]);
        const last=chain(Ed,rd,1).segs.find(s=>s.edit);
        chk('kueche-masskette: Tür an der Wand – das Feld reicht nur bis an die Tür (2500 statt 0)', !!last && near(last.edit.min,2500,1) && near(last.edit.max,3400,0.5));
        chk('kueche-masskette: Wandabstand vor die Tür wird abgelehnt, bündig neben der Tür geht',
          !KX.applyDim(Ed,rd.K,last.edit,2000) && rd.K.items[0].x===0 && KX.applyDim(Ed,rd.K,last.edit,2500) && !badF(Ed,rd).some(t=>/vor einer Tür/.test(t)));
        // ohne K bleiben die weiten Grenzen der Zeile; applyDim prüft trotzdem
        const wide=KX.chainDims(Ed,rd.L,rd.L.byId.get(1)).segs.find(s=>s.edit);
        chk('kueche-masskette: applyDim lehnt auch mit weiten Grenzen ab, was nicht passt (Tür im Weg)', !!wide && wide.edit.min===0 && !KX.applyDim(Ed,rd.K,wide.edit,2000) && KX.dimCheck(Ed,rd.K,wide.edit,2000).why==='fit');
        // Bestand mit Befund: vor der Tür darf der Block weg von dort
        const rb=kl(Ed,[{id:1,kind:'base',a:'A',b:'B',x:1500,w:600}]), fb=chain(Ed,rb,1).segs[0];
        chk('kueche-masskette: steht ein Teil schon vor der Tür, darf es per Wandabstand von dort weg',
          badF(Ed,rb).some(t=>/vor einer Tür/.test(t)) && !!fb.edit && KX.applyDim(Ed,rb.K,fb.edit,500) && !badF(Ed,rb).some(t=>/vor einer Tür/.test(t)));
        // ohne Hindernis bleiben die Grenzen der Zeile unverändert
        const ro=kl(E0,[{id:1,kind:'base',a:'A',b:'B',x:1000,w:600}]), fo=chain(E0,ro,1).segs.filter(s=>s.edit);
        chk('kueche-masskette: ohne Hindernis bleiben die Grenzen wie bisher (0–3400)', fo.length===2 && fo.every(s=>s.edit.min===0 && s.edit.max===3400));
      }
      // C4: spitze Ecke – gemessen auf halber Tiefe bis zur Nachbarwand
      [[60,0],[75,0],[60,1],[90,0],[120,0]].forEach(([deg,endB])=>{
        const th=deg*Math.PI/180, H=3000*Math.sin(th);
        const pts=!endB ? [{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:H},{id:'D',x:3000*Math.cos(th),y:H}]
                        : [{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000-3000*Math.cos(th),y:H},{id:'D',x:0,y:H}];
        const Ea=KX.makeEnv(pts,[['A','B'],['B','C'],['C','D'],['D','A']],[],[]), Wf=KX.wallFrame(Ea,'A','B');
        const lo=KX.cornerStop(Ea,Wf,580,endB), x=endB ? Wf.L-Math.ceil(lo)-500-600 : Math.ceil(lo)+500;
        const r=kl(Ea,[{id:1,kind:'base',a:'A',b:'B',x,w:600}]), cd=chain(Ea,r,1), seg=endB ? cd.segs[cd.segs.length-1] : cd.segs[0];
        const sEdge=endB ? x+600 : x, hit=TILES.rayToRing(Ea.ring, KX.wpt(Wf,sEdge,290), endB ? Wf.u : {x:-Wf.u.x,y:-Wf.u.y});
        chk(`kueche-masskette: ${deg}°-Ecke an ${endB?'B':'A'} – erster Wandabstand auf halber Tiefe gemessen (${hit?hit.t.toFixed(1):'?'} mm)`, !!hit && near(seg.b-seg.a, hit.t, 0.2));
      });
      {
        // 60°-Ecke A: die Kette beginnt dort, wo die Nachbarwand die halbe Tiefe schneidet; min des Felds passt dazu
        const th=Math.PI/3, pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000*Math.sin(th)},{id:'D',x:3000*Math.cos(th),y:3000*Math.sin(th)}];
        const Ea=KX.makeEnv(pts,[['A','B'],['B','C'],['C','D'],['D','A']],[],[]), Wf=KX.wallFrame(Ea,'A','B');
        const r=kl(Ea,[{id:1,kind:'base',a:'A',b:'B',x:835,w:600}]), cd=chain(Ea,r,1), e=cd.segs[0].edit;
        chk('kueche-masskette: 60°-Ecke – x0 = 290·cot 60° (167,4), Feld ab Frontkante an der Nachbarwand (min = cornerStop − x0)',
          near(cd.x0,290/Math.tan(th),0.1) && !!e && near(e.min, KX.cornerStop(Ea,Wf,580,0)-cd.x0, 0.1) && near(KX.wallReach(Ea,Wf,0,290),-cd.x0,1e-9));
        // Bestand vor der Reichweite (Teil schon bei s=100): keine Scheinlücke davor
        const rv=kl(Ea,[{id:1,kind:'base',a:'A',b:'B',x:100,w:600}]), cv_=chain(Ea,rv,1);
        chk('kueche-masskette: 60°-Ecke, Teil vor der Reichweite – Kette beginnt am Teil, keine Scheinlücke', cv_.segs[0].part===1 && cv_.x0<=100);
      }
      {
        // 90° und 120° wie bisher
        const E90=KX.makeEnv(R.pts,R.walls,[],[]), W90=KX.wallFrame(E90,'A','B');
        chk('kueche-masskette: rechtwinklige Ecke – Reichweite 0', KX.wallReach(E90,W90,0,290)===0 && KX.wallReach(E90,W90,1,290)===0);
        const th=2*Math.PI/3, pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:3000*Math.sin(th)},{id:'D',x:3000*Math.cos(th),y:3000*Math.sin(th)}];
        const E120=KX.makeEnv(pts,[['A','B'],['B','C'],['C','D'],['D','A']],[],[]);
        chk('kueche-masskette: stumpfe Ecke (120°) – Reichweite 167,4 über das Wandende hinaus', near(KX.wallReach(E120,KX.wallFrame(E120,'A','B'),0,290),290/Math.tan(Math.PI/3),0.1));
      }
      // C5 / C6: Maßfeld – welcher Treffer gilt, Eingabe prüfen vor snapshot()
      {
        const r=kl(E0,[{id:1,kind:'base',a:'A',b:'B',x:1000,w:600}]), segs0=chain(E0,r,1).segs.filter(s=>s.edit);
        const hA={edit:segs0[0].edit}, hB={edit:segs0[1].edit};   // die Treffer beim Klick auf B
        chk('kueche-masskette: Maßfeld – derselbe Treffer behält seinen Schlüssel, die Zahlen ändern sich nicht dessen Identität',
          KX.dimKey(hA.edit)!==KX.dimKey(hB.edit) && KX.dimKey({...hB.edit,cur:1,min:2,max:3})===KX.dimKey(hB.edit));
        // Feld A war offen (500 getippt) und wird beim Klick auf B gesetzt: A läuft vor B.
        const pA=KX.dimInput(E0,r.K,hA.edit,'500'); KX.applyDim(E0,r.K,hA.edit,pA.v);
        const fresh=KX.layout(E0,r.K), segs1=KX.chainDims(E0,fresh,fresh.byId.get(1),r.K).segs.filter(s=>s.edit).map(s=>({edit:s.edit}));
        const hB2=KX.dimResolve(segs1,hB);
        chk('kueche-masskette: Klick auf B bei offenem Feld A – B kommt mit frischen Werten (2900, nicht 2400)', !!hB2 && hB2.edit.cur===2900 && hB.edit.cur===2400);
        KX.applyDim(E0,r.K,hB2.edit,KX.dimInput(E0,r.K,hB2.edit,'1000').v);
        chk('kueche-masskette: … und 1000 eingegeben ergibt rechts genau 1000 (alter Treffer: 1500)', near(4000-(r.K.items[0].x+600),1000,0.5));
        const rs=kl(E0,[{id:1,kind:'base',a:'A',b:'B',x:1000,w:600}]);
        KX.applyDim(E0,rs.K,hA.edit,500); KX.applyDim(E0,rs.K,hB.edit,1000);
        chk('kueche-masskette: mit dem alten Treffer wäre es rechts 1500 geworden (Beleg für den Fehler)', near(4000-(rs.K.items[0].x+600),1500,0.5));
        chk('kueche-masskette: Maß, das es nicht mehr gibt – kein Treffer', KX.dimResolve([],hB)===null && KX.dimResolve(segs1.filter(s=>s.edit.side===0),hB)===null);
        // freie Teile: Teil und Richtung
        const rf=kl(E0,[{id:1,kind:'island',x:2000,y:1500,rot:0,w:1800,d:900}]), fd=KX.freeDims(E0,rf.L,rf.L.byId.get(1)), keys=fd.map(d=>KX.dimKey(d.edit));
        chk('kueche-masskette: freies Teil – je Seite ein eigener Schlüssel', new Set(keys).size===4 && KX.dimKey({...fd[0].edit,cur:5})===keys[0]);
      }
      {
        const r=kl(E0,[{id:1,kind:'base',a:'A',b:'B',x:1000,w:600}]), e=chain(E0,r,1).segs.find(s=>s.edit).edit, j0=JSON.stringify(r.K);
        const k=raw=>KX.dimInput(E0,r.K,e,raw).kind;
        chk('kueche-masskette: Eingabe – keine Zahl, leer, unverändert: nichts zu tun', k('abc')==='none' && k('')==='none' && k('1000')==='none' && k('1000,3')==='none');
        chk('kueche-masskette: Eingabe – außerhalb [min,max] und negativ: Hinweis, kein Setzen', k('9999')==='range' && k('-5')==='range' && k('3401')==='range');
        const ok=KX.dimInput(E0,r.K,e,'1250,5');
        chk('kueche-masskette: Eingabe – gültig mit Komma, Wert gelesen', ok.kind==='ok' && ok.v===1250.5);
        chk('kueche-masskette: Eingabe prüft nur – der Stand bleibt unverändert (erst danach snapshot)', JSON.stringify(r.K)===j0);
        const door={id:'o2',kind:'door',a:'A',b:'B',x:1500,w:900,y:0,h:2000,swing:{type:'turn',hinge:'left',out:false}};
        const Ed=KX.makeEnv(R.pts,R.walls,[door],[]), rd=kl(Ed,[{id:1,kind:'base',a:'A',b:'B',x:0,w:600}]);
        const wide=KX.chainDims(Ed,rd.L,rd.L.byId.get(1)).segs.find(s=>s.edit).edit;
        chk('kueche-masskette: Eingabe – im Bereich, aber nicht passend: „fit“ statt Setzen', KX.dimInput(Ed,rd.K,wide,'2000').kind==='fit' && KX.dimInput(Ed,rd.K,wide,'3000').kind==='ok');
      }
      // C7: rayPoly teilt die Schnittformel mit TL.rayToRing (Mindestabstand als Parameter), centroid mit kitchen-ui
      {
        let seed=12345; const rnd=()=>{ seed=(seed*1103515245+12345)%2147483648; return seed/2147483648; };
        const ref=(p,d,poly)=>{ let best=null; for(let i=0;i<poly.length;i++){ const a=poly[i], b=poly[(i+1)%poly.length], e={x:b.x-a.x,y:b.y-a.y}, den=d.x*e.y-d.y*e.x;
            if(Math.abs(den)<1e-12) continue; const t=((a.x-p.x)*e.y-(a.y-p.y)*e.x)/den, u=((a.x-p.x)*d.y-(a.y-p.y)*d.x)/den;
            if(t>1e-6 && u>=-1e-9 && u<=1+1e-9 && (best==null || t<best)) best=t; } return best; };
        let same=true, hits=0;
        for(let n=0;n<400;n++){
          const w=100+rnd()*900, h=100+rnd()*900, ox=(rnd()-0.5)*2000, oy=(rnd()-0.5)*2000, a=rnd()*Math.PI*2;
          const poly=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}].map(q=>({x:ox+q.x*Math.cos(a)-q.y*Math.sin(a), y:oy+q.x*Math.sin(a)+q.y*Math.cos(a)}));
          const p={x:(rnd()-0.5)*3000,y:(rnd()-0.5)*3000}, c0=KX.centroid(poly), t=Math.atan2(c0.y-p.y,c0.x-p.x)+(rnd()-0.5)*0.5, d={x:Math.cos(t),y:Math.sin(t)};   // meist auf das Teil gerichtet
          const x=KX.rayPoly(p,d,poly), y=ref(p,d,poly);
          if(!(x===y || (x!=null && y!=null && Math.abs(x-y)<1e-9))) same=false;
          if(x!=null) hits++;
        }
        chk('kueche-masskette: rayPoly rechnet wie die frühere eigene Schnittformel (400 Strahlen, '+hits+' Treffer)', same && hits>200);
        const sq=[{x:0.5,y:-1},{x:2,y:-1},{x:2,y:1},{x:0.5,y:1}], inn={x:1.5,y:0}, dx={x:1,y:0};   // Start 0,5 mm vor der rechten Kante
        chk('kueche-masskette: Mindestabstand – ein Teil 0,5 mm vor dem Start zählt (rayPoly), die Wand erst ab 1 mm (Standard)',
          near(KX.rayPoly(inn,dx,sq),0.5,1e-9) && TILES.rayToRing(sq,inn,dx)===null && near(TILES.rayToRing(sq,inn,dx,1e-6).t,0.5,1e-9));
        chk('kueche-masskette: TL.rayToRing ohne Parameter wie bisher (ab 1 mm, mit Auftreffpunkt q)', (()=>{ const r=TILES.rayToRing(sq,{x:-5,y:0},dx); return r && near(r.t,5.5,1e-9) && near(r.q.x,0.5,1e-9); })());
        const P=[{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:0,y:2}], c=KX.centroid(P);
        chk('kueche-masskette: centroid ist der Eckenmittelwert, eine Quelle für kitchen und kitchen-ui', near(c.x,2,1e-12) && near(c.y,1,1e-12));
      }
    }catch(err){ chk('kueche: Review-Fix Rest: masskette ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: platte ---
    try{
      // Umgebung ohne Fenster und Tür: ein Hochschrank bei x=1600 verdeckte sonst das Fenster der Prüfumgebung E.
      const EP=KX.makeEnv(R.pts,R.walls,[],[]);
      const layP=items=>{ const K=KX.normKitchen({items}); const L=KX.layout(EP,K); return {K,L,F:KX.check(EP,K,L)}; };
      const bs=(id,x,w=600)=>({id,kind:'base',a:'A',b:'B',x,w}), tl=(id,x,w)=>({id,kind:'tall',a:'A',b:'B',x,w});
      const span=r=>JSON.stringify(r.L.tops.filter(t=>!t.island && !t.patch).map(t=>[Math.round(t.s0),Math.round(t.s1)]).sort((p,q)=>p[0]-q[0]));
      // D1: Hochschrank in der Lücke zwischen zwei Unterschränken
      {
        const r=layP([bs(1,1000), tl(2,1600,150), bs(3,1750)]), St=KX.stock(r.K,r.L);
        chk('kueche-platte: Hochschrank (150) zwischen zwei Unterschränken – zwei Platten, kein Füller, keine Passleiste',
          span(r)==='[[1000,1600],[1750,2350]]' && r.L.fillers.length===0 && !has(r.F,/Passleiste/)
          && St.tops.length===2 && near(St.topSum,1200,0.01) && St.fillers.length===0);
        const r2=layP([bs(1,1000), tl(2,1600,100), bs(3,1750)]);
        chk('kueche-platte: Hochschrank (100) in 150 mm Lücke – die Platte endet an ihm, der Rest (50) wird Passleiste am Plattenende',
          span(r2)==='[[1000,1600],[1700,2350]]' && r2.L.fillers.length===1 && !!r2.L.fillers[0].end && !r2.L.fillers[0].between && near(r2.L.fillers[0].w,50,0.01));
        const r3=layP([bs(1,1000), bs(3,1700)]);
        chk('kueche-platte: 100 mm Lücke ohne Hochschrank – wie bisher eine Platte mit Passleiste dazwischen',
          span(r3)==='[[1000,2300]]' && r3.L.fillers.length===1 && !!r3.L.fillers[0].between && has(r3.F,/Passleiste 100 mm zwischen zwei Schränken/));
      }
      // D3: Tisch – die längere Seite ist die Langseite, gleich in welches Feld sie eingetragen ist
      {
        const tab=(w,d,rot,x,y)=>{ const r=layP([{id:1,kind:'table',x:x==null?2500:x,y:y==null?1500:y,rot:rot||0,w,d}]), g=r.L.byId.get(1);
          return {n:KX.tableSeats(g,EP,r.L), sd:KX.tableSides(g,EP,r.L), F:r.F}; };
        const a=tab(1600,900), b=tab(900,1600), lg=b.sd.filter(s=>near(s.len,1600,0.01)), sh=b.sd.filter(s=>near(s.len,900,0.01));
        chk('kueche-platte: Tisch 900 × 1600 hat wie 1600 × 900 sechs Plätze, an den 1600er Seiten je 2, an den Stirnseiten je 1',
          a.n===6 && b.n===6 && lg.length===2 && lg.every(s=>!s.end && s.seats===2) && sh.length===2 && sh.every(s=>s.end && s.seats===1));
        chk('kueche-platte: Tisch 800 × 1200 = 1200 × 800 (4 Plätze), 1000 × 2000 = 2000 × 1000 (6)',
          tab(800,1200).n===4 && tab(1200,800).n===4 && tab(1000,2000).n===6 && tab(2000,1000).n===6);
        chk('kueche-platte: quadratischer Tisch unverändert (bei Gleichstand ist w die Langseite)',
          tab(1600,1600).n===6 && tab(800,800).n===2 && tab(1600,1600).sd.filter(s=>!s.end).length===2);
        chk('kueche-platte: seatPlan(900,1600) = seatPlan(1600,900), um 90° gedrehter Tisch ebenfalls 6',
          JSON.stringify(KX.seatPlan(900,1600))===JSON.stringify(KX.seatPlan(1600,900)) && tab(900,1600,90).n===6 && tab(1600,900,90).n===6);
        // Stirnseite (900) an der Wand: kein Stuhl dort, die Langseiten behalten ihre Plätze (2 + 2 + 1 Stirnplatz)
        const w1=tab(900,1600,0,2000,800), w0=w1.sd.filter(s=>!s.open);
        chk('kueche-platte: Tisch 900 × 1600 mit der Stirnseite an der Wand – 5 Plätze, nur diese Seite ohne Stuhlraum',
          w1.n===5 && w0.length===1 && w0[0].end && near(w0[0].len,900,0.01));
        // Stuhlraum-Prüfung folgt der Langseite: Langseite (1600) 600 mm vor der Wand
        chk('kueche-platte: Tisch 900 × 1600, Langseite 600 mm vor der Wand – Prüfung meldet den Stuhlraum',
          has(tab(900,1600,0,1050,1500).F, /hinter den Stühlen nur 600 mm/, 'bad') && has(tab(1600,900,90,1050,1500).F, /hinter den Stühlen nur 600 mm/, 'bad'));
      }
      // D2: stumpfe Innenecke – das Dreieck zwischen den beiden Platten gehört zur durchlaufenden Platte (konvexes Fünfeck)
      {
        const rad=Math.PI/180, convex=P=>{ let s=0; for(let i=0;i<P.length;i++){ const a=P[i], b=P[(i+1)%P.length], c=P[(i+2)%P.length], z=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
          if(Math.abs(z)<1e-6) continue; const sg=z>0 ? 1 : -1; if(s && sg!==s) return false; s=sg; } return true; };
        // Ecke o mit Innenwinkel deg: Durchlaufwand o–f entlang +x (Zeile 1200 in der Ecke), Querwand o–c unter deg (Zeile 600 auf der freien Stelle)
        const bay=(deg,[o,f,x,c],cabs=2)=>{ const a=deg*rad, pos={[o]:{x:0,y:0},[f]:{x:4000,y:0},[x]:{x:4000,y:3000*Math.sin(a)},[c]:{x:3000*Math.cos(a),y:3000*Math.sin(a)}};
          const Eb=KX.makeEnv(['A','B','C','D'].map(id=>({id,...pos[id]})), [[o,f],[f,x],[x,c],[c,o]], [], []);
          const Wt=KX.wallFrame(Eb,o,f), Wc=KX.wallFrame(Eb,o,c), it1={id:2,kind:'base',a:Wt.a,b:Wt.b,x:Wt.a===o ? 0 : Wt.L-1200,w:1200};
          const K0=KX.normKitchen({items:[it1]}), L0=KX.layout(Eb,K0), xc=KX.freeSlot(Eb,K0,L0,{id:1,kind:'base',w:600},Wc);
          const K=KX.normKitchen({items:cabs>1 ? [{id:1,kind:'base',a:Wc.a,b:Wc.b,x:xc,w:600}, it1] : [it1]}), L=KX.layout(Eb,K);
          return {E:Eb, K, L, Wt, Wc, F:KX.check(Eb,K,L)}; };
        // Fläche (mm²) in den Tiefenstreifen beider Wände um die Ecke o (Radius 600), die keine Platte deckt; Raster 10 mm, schräg versetzt
        const holeAt=(Eb,L,o)=>{ const O=Eb.pts[Eb.I[o]], ws=[...Eb.wallsByKey.values()].filter(W=>W.a===o || W.b===o).map(W=>KX.wallFrame(Eb,W.a,W.b)); let n=0;
          for(let px=-700;px<=700;px+=10) for(let py=-700;py<=700;py+=10){ const p={x:O.x+px+0.37, y:O.y+py+0.61};
            if(Math.hypot(px,py)>600 || !TILES.pointInRoom(p,Eb.ring) || !ws.every(w=>(p.x-w.A.x)*w.n.x+(p.y-w.A.y)*w.n.y<600)) continue;
            if(!L.tops.some(t=>TILES.pointInRing(p,t.poly))) n++; }
          return n*100; };
        const topOn=(L,key)=>L.tops.find(t=>t.Wf && t.Wf.key===key);
        const b120=bay(120,['A','B','C','D']), tA=topOn(b120.L,'A|B'), tD=topOn(b120.L,'A|D'), St=KX.stock(b120.K,b120.L);
        chk('kueche-platte: stumpfe Ecke 120° – im Eckfeld bleibt keine Fläche ohne Platte (vorher rund 75000 mm²)', holeAt(b120.E,b120.L,'A')<=300);
        chk('kueche-platte: stumpfe Ecke – durchlaufende Platte ist ein konvexes Fünfeck mit der Spitze an der Nachbarwand, Zeile und Querplatte unverändert',
          tA.poly.length===5 && convex(tA.poly) && near((tA.poly[4].x-b120.Wc.A.x)*b120.Wc.n.x+(tA.poly[4].y-b120.Wc.A.y)*b120.Wc.n.y,0,0.01)
          && near(tA.s0,0,0.01) && near(tA.s1,1200,0.01) && tD.poly.length===4 && near(tD.s0,519.6,0.5) && near(tD.len,632.7,0.5) && !TILES.convexOverlap(tA.poly,tD.poly,1));
        chk('kueche-platte: stumpfe Ecke – Stückliste nennt die Zuschnittlänge der durchlaufenden Platte (1200 + 260 bis an die Wand), ohne neue Befunde',
          near(tA.len,1459.8,1) && St.tops.length===2 && near(St.tops[0].len,1459.8,1) && near(St.topSum,1459.8+632.7,1.5) && !has(b120.F,/Arbeitsplatte|überlappen/));
        // Ecke am b-Ende der Durchlaufwand, Eckennamen vertauscht (kanonische Wandrahmen kippen)
        chk('kueche-platte: stumpfe Ecke in jeder Benennung der Ecken (Ecke an a- oder b-Ende beider Wände) – ohne Lücke, genau ein Fünfeck',
          [['A','B','C','D'],['B','A','D','C'],['C','B','A','D'],['D','C','B','A'],['B','C','D','A'],['C','D','A','B']].every(ids=>{
            const r=bay(135,ids); return holeAt(r.E,r.L,ids[0])<=300 && r.L.tops.filter(t=>t.poly.length===5).length===1 && r.L.tops.every(t=>convex(t.poly)); }));
        // kurze Zeile in der Ecke: sie ist die durchlaufende, die lange Querzeile schließt an
        { const Eb=bay(120,['A','B','C','D']).E, Wt=KX.wallFrame(Eb,'A','B'), itC={id:1,kind:'base',a:'A',b:'D',x:0,w:600};
          const K0=KX.normKitchen({items:[itC]}), xt=KX.freeSlot(Eb,K0,KX.layout(Eb,K0),{id:2,kind:'base',w:1200},Wt), K=KX.normKitchen({items:[itC,{id:2,kind:'base',a:'A',b:'B',x:xt,w:1200}]}), L=KX.layout(Eb,K);
          chk('kueche-platte: stumpfe Ecke – liegt die kurze Zeile in der Ecke, wird sie zum Fünfeck und die lange schließt an',
            holeAt(Eb,L,'A')<=300 && topOn(L,'A|D').poly.length===5 && topOn(L,'A|B').poly.length===4 && near(topOn(L,'A|D').len,600+259.8,1)); }
        // Sechseck: Zeile zwischen zwei stumpfen Ecken (135°) bekommt an beiden Enden ihre Spitze
        { const hp=[{id:'A',x:0,y:800},{id:'B',x:800,y:0},{id:'C',x:3200,y:0},{id:'D',x:4000,y:800},{id:'E',x:4000,y:3000},{id:'F',x:0,y:3000}],
            Eh=KX.makeEnv(hp,[['A','B'],['B','C'],['C','D'],['D','E'],['E','F'],['F','A']],[],[]), row=[0,600,1200,1800].map((x,i)=>({id:10+i,kind:'base',a:'B',b:'C',x,w:600}));
          const K0=KX.normKitchen({items:row}), L0=KX.layout(Eh,K0), x1=KX.freeSlot(Eh,K0,L0,{id:1,kind:'base',w:600},KX.wallFrame(Eh,'A','B')), x2=KX.freeSlot(Eh,K0,L0,{id:2,kind:'base',w:600},KX.wallFrame(Eh,'C','D'));
          const K=KX.normKitchen({items:[...row,{id:1,kind:'base',a:'A',b:'B',x:x1,w:600},{id:2,kind:'base',a:'C',b:'D',x:x2,w:600}]}), L=KX.layout(Eh,K), th=topOn(L,'B|C');
          chk('kueche-platte: Sechseck – die Zeile zwischen zwei stumpfen Ecken wird ein konvexes Sechseck (3,0 m Zuschnitt), beide Ecken ohne Lücke',
            th.poly.length===6 && convex(th.poly) && near(th.len,3000,1) && near(th.s0,0,0.01) && near(th.s1,2400,0.01) && holeAt(Eh,L,'B')<=300 && holeAt(Eh,L,'C')<=300); }
        // Rechtwinklig und Messrauschen bleiben Rechtecke; ohne Querplatte gibt es keine Spitze
        chk('kueche-platte: stumpfe Ecke – unter 10 mm Lücke (90°, 90,5°) bleibt die Platte rechteckig, bei 92° (21 mm) wird sie ein Fünfeck; ohne Querplatte bleibt sie ein Rechteck',
          [90,90.5].every(d=>bay(d,['A','B','C','D']).L.tops.every(t=>t.poly.length===4)) && topOn(bay(92,['A','B','C','D']).L,'A|B').poly.length===5
          && bay(120,['A','B','C','D'],1).L.tops.every(t=>t.poly.length===4));
      }
    }catch(err){ chk('kueche: Review-Fix Rest: platte ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: pruef ---
    try{
      // E1-E6 (Prüfregeln): Gang an der Plattenkante, mehrere Geräte einer Art,
      // Spüle-Kochfeld über die Platte, Tresen, Dreieck-Meldung. Eigene Räume:
      // der gemeinsame hat Fenster und Tür.
      const mkE=(w,h,opens)=>{ const r=rect(w,h); return KX.makeEnv(r.pts,r.walls,opens||[],[]); };
      const lay2=(Ev,items,spec)=>{ const K=KX.normKitchen({spec,items}); const L=KX.layout(Ev,K); return {K,L,F:KX.check(Ev,K,L)}; };
      {
        // E1: NKBA Guideline 6 misst den Gang an der „counter frontage“, die Platte steht vor dem Korpus über.
        const Eg=mkE(4000,2380), gal=topD=>lay2(Eg,[{id:1,kind:'base',a:'A',b:'B',x:1000,w:1200},{id:2,kind:'base',a:'C',b:'D',x:1000,w:1200}],{topD}).F;
        chk('kueche-pruef: Gang zwischen den Platten – 600er Platten lassen 1180 mm, das ist unter 1200 (gelb)', has(gal(600),/Gang vor Unterschrank 120 11\d\d mm/,'warn'));
        chk('kueche-pruef: Gang zwischen den Platten – 700er lassen 980 mm (gelb), 900er nur 580 mm (rot)',
          has(gal(700),/Gang vor Unterschrank 120 9\d\d mm/,'warn') && has(gal(900),/Vor Unterschrank 120 nur 5\d\d mm Platz/,'bad'));
        chk('kueche-pruef: Gang – Platte bündig zum Korpus (topD 580), 1219 mm zwischen den Fronten: kein Befund', !has(gal(580),/Gang|Platz/));
        // Innenecke mit Passblende: die Querplatte stößt an die Vorderkante der durchlaufenden, dort ist kein Gang.
        const rL=lay2(mkE(4000,3000),[{id:1,kind:'base',a:'D',b:'A',x:1800,w:1200,front:'door'},{id:2,kind:'base',a:'A',b:'B',x:630,w:600},{id:3,kind:'base',a:'A',b:'B',x:1230,w:900}]);
        chk('kueche-pruef: Gang – L-Küche mit Passblende in der Ecke: keine Gangbefunde (Blindecke bleibt Blindecke)', !has(rL.F,/Gang|Platz/));
        // Platten, die sich berühren oder überlappen, sind kein Gang: weiter rot, nicht still (Strahl begänne in der Platte gegenüber).
        const gk=H=>{ const Eh=mkE(4000,H); return lay2(Eh,[{id:1,kind:'base',a:'A',b:'B',x:1000,w:1200},{id:2,kind:'base',a:'C',b:'D',x:1000,w:1200}]).F; };
        chk('kueche-pruef: Gang – Zeilen gegenüber, Platten berühren sich (Körper 40 mm auseinander) oder überlappen: rot mit wenigen mm', has(gk(1200),/Vor Unterschrank 120 nur \d{1,2} mm Platz/,'bad') && has(gk(1180),/Vor Unterschrank 120 nur \d{1,2} mm Platz/,'bad'));
        const ins=gap=>lay2(mkE(4000,3000),[{id:1,kind:'base',a:'A',b:'B',x:1000,w:1200},{id:2,kind:'island',x:1600,y:580+gap+300,rot:180,w:1200,d:600}]).F;
        chk('kueche-pruef: Gang – Insel 15 mm vor dem Korpus (in der Plattenkante der Zeile): rot, nicht still', has(ins(15),/Vor Insel 120 nur \d{1,2} mm Platz/,'bad') && has(ins(15),/Vor Unterschrank 120 nur \d{1,2} mm Platz/,'bad'));
      }
      {
        // E2: von einer Art mehrere Geräte
        const E6=mkE(6000,3000), sk=(id,x)=>({id,kind:'base',dev:'sink',a:'A',b:'B',x,w:600}), dwx=(x)=>({id:9,kind:'base',dev:'dw',a:'A',b:'B',x,w:600});
        chk('kueche-pruef: zwei Spülen – Spülmaschine neben der zweiten: keine Warnung, in jeder Reihenfolge',
          !has(lay2(E6,[sk(1,0),sk(2,3000),dwx(3600)]).F,/Spülmaschine .* von der Spüle/) && !has(lay2(E6,[sk(2,3000),sk(1,0),dwx(3600)]).F,/Spülmaschine .* von der Spüle/));
        chk('kueche-pruef: zwei Spülen – Spülmaschine weit weg: die Warnung nennt den Abstand zur nächsten Spüle',
          has(lay2(E6,[sk(1,0),sk(2,3000),dwx(4700)]).F,/Spülmaschine 1100 mm von der Spüle/,'warn'));
        const win2={id:'o1',kind:'window',a:'A',b:'B',x:2000,w:1000,y:1000,h:1200,swing:{type:'turntilt',hinge:'left',out:false}}, Ew=mkE(4000,3000,[win2]);
        const hb=(id,x)=>({id,kind:'base',dev:'hob',a:'A',b:'B',x,w:600});
        chk('kueche-pruef: zwei Kochfelder – das zweite unter dem Fenster ist rot', has(lay2(Ew,[hb(1,0),hb(2,2200)]).F,/Kochfeld unter einem Fenster/,'bad'));
        const E4=mkE(4000,3000), bs=(id,x,w)=>({id,kind:'base',a:'A',b:'B',x,w});
        chk('kueche-pruef: zwei Kochfelder – Abstellfläche je Kochfeld: das zweite ohne Platte daneben wird gemeldet',
          has(lay2(E4,[bs(1,0,450),hb(2,450),bs(3,1050,450),hb(4,2500)]).F,/Neben dem Kochfeld 0 mm Abstellfläche/,'warn') && !has(lay2(E4,[bs(1,0,450),hb(2,450),bs(3,1050,450)]).F,/Neben dem Kochfeld/));
        const fr=(id,x)=>({id,kind:'tall',dev:'fridge',a:'A',b:'B',x,w:600,hinge:'left'});
        chk('kueche-pruef: zwei Kühlschränke – Abstellfläche je Gerät: der zweite ohne Platte neben dem Griff wird gemeldet',
          has(lay2(E4,[fr(1,0),bs(2,600,600),fr(3,3000)]).F,/Kühlschrank: neben dem Griff keine Abstellfläche/,'warn') && !has(lay2(E4,[fr(1,0),bs(2,600,600)]).F,/Abstellfläche/));
        // Arbeitsdreieck: die Kombination mit den wenigsten Verstößen zählt (erste Spüle weit, zweite gut)
        const E8=mkE(8000,4000), tr3=items=>lay2(E8,items).F;
        const tri=[{id:1,kind:'tall',dev:'fridge',a:'A',b:'B',x:0,w:600,hinge:'left'},{id:2,kind:'base',dev:'hob',a:'A',b:'B',x:1230,w:600}];
        chk('kueche-pruef: zwei Spülen – Dreieck: die zweite bildet ein gutes Dreieck, die erste weit weg stört nicht',
          !has(tr3([...tri, sk(3,7000), sk(4,2460)]),/Arbeitsdreieck/) && has(tr3([...tri, sk(3,7000)]),/Arbeitsdreieck/,'warn'));
      }
      {
        // E3: Arbeitsfläche zwischen Spüle und Kochfeld = durchgehende Platte dazwischen
        const E4=mkE(4000,3000), sk=x=>({id:1,kind:'base',dev:'sink',a:'A',b:'B',x,w:600}), hb=x=>({id:2,kind:'base',dev:'hob',a:'A',b:'B',x,w:600});
        const sp=(items)=>lay2(E4,items).F, re=/Zwischen Spüle und Kochfeld (\d+) mm Arbeitsfläche/;
        const mmOf=F=>{ const f=F.find(x=>re.test(x.txt)); return f ? +re.exec(f.txt)[1] : null; };
        chk('kueche-pruef: Spüle – Kochfeld – leere Wand dazwischen zählt nicht als Arbeitsfläche (0 mm)', mmOf(sp([sk(0),hb(1600)]))===0);
        chk('kueche-pruef: Spüle – Hochschrank – Unterschrank – Kochfeld: nur die 300 mm Platte zählen',
          mmOf(sp([sk(0),{id:3,kind:'tall',a:'A',b:'B',x:600,w:600},{id:4,kind:'base',a:'A',b:'B',x:1200,w:300},hb(1500)]))===300);
        chk('kueche-pruef: Spüle – 300er Unterschrank – Kochfeld: 300 mm (wie bisher)', mmOf(sp([sk(0),{id:4,kind:'base',a:'A',b:'B',x:600,w:300},hb(900)]))===300);
        chk('kueche-pruef: Spüle – Spülmaschine und Unterschrank 900 mm – Kochfeld: genug Platte, keine Meldung',
          mmOf(sp([sk(0),{id:3,kind:'base',dev:'dw',a:'A',b:'B',x:600,w:600},{id:4,kind:'base',a:'A',b:'B',x:1200,w:300},hb(1500)]))===null);
        // über Eck: Spüle an A–B in der Ecke B, Kochfeld an B–C
        const hbC=(x)=>({id:2,kind:'base',dev:'hob',a:'B',b:'C',x,w:600});
        chk('kueche-pruef: L-Küche – Spüle in der Ecke, Kochfeld gleich dahinter: 20 mm Platte dazwischen (früher kein Befund)', mmOf(sp([sk(3400),hbC(600)]))===20);
        chk('kueche-pruef: L-Küche – Platte läuft durch die Ecke: 600 + 930 − Eckquadrat 600 = 930 mm, genug; mit 330 mm blanker Wand vor dem Kochfeld nur 600 mm',
          mmOf(sp([sk(2800),{id:3,kind:'base',a:'A',b:'B',x:3400,w:600},{id:4,kind:'base',a:'B',b:'C',x:630,w:300},hbC(930)]))===null && mmOf(sp([sk(2800),{id:3,kind:'base',a:'A',b:'B',x:3400,w:600},hbC(930)]))===600);
        chk('kueche-pruef: L-Küche – Kochfeld näher an der Ecke: 630 mm Platte (gelb)',
          mmOf(sp([sk(2800),{id:3,kind:'base',a:'A',b:'B',x:3400,w:600},hbC(630)]))===630);
        chk('kueche-pruef: Spüle auf der Insel – Lage im Gerät nicht modelliert, kein Befund',
          mmOf(sp([{id:1,kind:'island',dev:'sink',x:2000,y:1500,rot:0,w:1200,d:900},hb(0)]))===null);
      }
      {
        // E4: die Vorgabe (je Seite 300) bleibt, der Text nennt NKBA richtig (Guideline 17: 305 und 381)
        const E4=mkE(4000,3000), bs=(id,x,w)=>({id,kind:'base',a:'A',b:'B',x,w}), hb=(id,x)=>({id,kind:'base',dev:'hob',a:'A',b:'B',x,w:600});
        chk('kueche-pruef: Abstellfläche am Kochfeld – 300 mm je Seite bleiben ohne Befund (Spec), ohne Platte der Text mit NKBA 305/381',
          !has(lay2(E4,[bs(1,500,300),hb(2,800),bs(3,1400,300)]).F,/Neben dem Kochfeld/) && has(lay2(E4,[hb(2,850)]).F,/Neben dem Kochfeld 0 mm Abstellfläche – je Seite mind\. 300 mm \(NKBA: 305 mm auf einer, 381 mm auf der anderen Seite\)/,'warn'));
      }
      {
        // E5: Tresen – Fehler unter 750 wie am Tisch; gemessen über die ganze Hockerkante
        const Et=mkE(4000,3000), bar=y=>lay2(Et,[{id:1,kind:'island',x:2000,y,rot:180,w:1800,d:900,bar:300}]).F;
        chk('kueche-pruef: Tresen – 650 mm hinter den Hockern ist rot (mind. 750 wie am Tisch), 780 mm gelb',
          has(bar(1600),/Tresen: hinter den Hockern nur 650 mm \(mind\. 750, NKBA 813\)/,'bad') && has(bar(1470),/Tresen: hinter den Hockern 780 mm/,'warn') && !has(bar(1400),/Tresen/));
        const isl={id:1,kind:'island',x:2000,y:1000,rot:180,w:1800,d:900,bar:300}, tr=extra=>lay2(Et,[isl,...extra]).F;
        chk('kueche-pruef: Tresen – Schrank hinter dem Ende der Hockerkante (nicht hinter der Mitte) wird erkannt',
          has(tr([{id:2,kind:'base',a:'C',b:'D',x:1100,w:600}]),/Tresen: hinter den Hockern nur 6\d\d mm \(mind\. 750/,'bad'));
        chk('kueche-pruef: Tresen – Schrank jenseits des Endes der Hockerkante: kein Tresenbefund', !has(tr([{id:2,kind:'base',a:'C',b:'D',x:0,w:600}]),/Tresen/));
      }
      {
        // E6: Arbeitsdreieck – NKBA Guideline 3 nennt metrisch selbst 7,9 m und 1,2 bis 2,7 m; die Meldung zeigt, welcher Schenkel falsch ist
        const E8=mkE(8000,4000), tri=xs=>lay2(E8,[{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:xs[0],w:600},{id:2,kind:'base',dev:'hob',a:'A',b:'B',x:xs[1],w:600},{id:3,kind:'tall',dev:'fridge',a:'A',b:'B',x:xs[2],w:600}]).F;
        chk('kueche-pruef: Arbeitsdreieck – Schenkel 2720 mm steht als „2,72 m (zu lang)“, nicht als „2,7“ neben der Grenze 2,7',
          has(tri([0,2720,1360]),/Schenkel Spüle–Kochfeld 2,72 m \(zu lang\), Kochfeld–Kühlschrank 1,36 m, Kühlschrank–Spüle 1,36 m – NKBA: Summe ≤ 7,9 m, je Schenkel 1,2–2,7 m/,'warn'));
        chk('kueche-pruef: Arbeitsdreieck – Schenkel 2700 und 1200 mm (NKBA 2,7 und 1,2 m) bleiben ohne Befund', !has(tri([0,2700,1350]),/Arbeitsdreieck/) && !has(tri([0,2400,1200]),/Arbeitsdreieck/));
        chk('kueche-pruef: Arbeitsdreieck – zu kurzer Schenkel (0,6 m) wird benannt', has(tri([0,1500,2100]),/Kochfeld–Kühlschrank 0,60 m \(zu kurz\)/,'warn'));
      }
      {
        // Nachtrag nach der Gegenprüfung: freie Teile quer zur Zeile, Grenzwerte in gedrehten Räumen
        // (Wände schief, Koordinaten mit Nachkommastellen: dort liegt ein gemessener Wert um 1e-11 neben dem Sollwert),
        // Spüle–Kochfeld mit mehreren Paaren, Wahl der Dreieck-Kombination bei Gleichstand.
        const rotE=(w,h,deg)=>{ const a=deg*Math.PI/180, cs=Math.cos(a), sn=Math.sin(a), r=rect(w,h);
          return KX.makeEnv(r.pts.map(p=>({id:p.id, x:p.x*cs-p.y*sn+1234.5, y:p.x*sn+p.y*cs-777.7})), r.walls, [], []); };
        const row=(id,x,w)=>({id,kind:'base',a:'A',b:'B',x,w}), sk=(id,x)=>({id,kind:'base',dev:'sink',a:'A',b:'B',x,w:600}), hb=x=>({id:2,kind:'base',dev:'hob',a:'A',b:'B',x,w:600});
        // Plattenkante der Zeile steht 20 mm vor dem Korpus; Insel/Tisch quer (90°) 10 mm vor dem Korpus liegt darin.
        const quer=(kind,gap)=>lay2(mkE(4000,3000),[row(1,1000,1200), kind==='island' ? {id:2,kind:'island',x:1600,y:580+gap+600,rot:90,w:1200,d:600} : {id:2,kind:'table',x:1600,y:580+gap+800,rot:90,w:1600,d:800}]).F;
        chk('kueche-pruef: Gang – Insel quer (90°) 10 mm vor dem Korpus, in der Plattenkante der Zeile: rot, nicht still', has(quer('island',10),/Vor Unterschrank 120 nur \d{1,2} mm Platz/,'bad'));
        chk('kueche-pruef: Gang – Tisch quer (90°) 10 mm vor dem Korpus, in der Plattenkante der Zeile: rot, nicht still', has(quer('table',10),/Vor Unterschrank 120 nur \d{1,2} mm Platz/,'bad'));
        // Spüle–Kochfeld genau 900 mm
        const zw=(deg,items)=>has(lay2(rotE(5000,3000,deg),items).F,/Zwischen Spüle und Kochfeld/);
        chk('kueche-pruef: Spüle – 900er – Kochfeld im gedrehten Raum (17°, 133°, 0,5°): genau 900 mm Platte sind genug, 899 mm werden gemeldet',
          [17,133,0.5].every(d=>!zw(d,[sk(1,0),row(3,600,900),hb(1500)]) && !zw(d,[sk(1,0),row(3,600,450),row(4,1050,450),hb(1500)]) && zw(d,[sk(1,0),row(3,600,899),hb(1499)])));
        const lr=deg=>lay2(rotE(4000,3000,deg),[sk(1,2800),row(3,3400,600),{id:4,kind:'base',a:'B',b:'C',x:600,w:300},{id:2,kind:'base',dev:'hob',a:'B',b:'C',x:900,w:600}]).F;
        chk('kueche-pruef: L-Küche im gedrehten Raum (0,5°, 1°, 2,5°): die Platte läuft genau 900 mm um die Ecke – keine Meldung', [0.5,1,2.5].every(d=>!has(lr(d),/Zwischen Spüle/)));
        // Gang, Tresen, Tisch an ihren Grenzen
        const gr=(H,deg)=>lay2(rotE(4000,H,deg),[row(1,1000,1200),{id:2,kind:'base',a:'C',b:'D',x:1000,w:1200}]).F;
        chk('kueche-pruef: Gang im gedrehten Raum (17°): genau 1200 mm sind genug, 900 mm sind gelb und nicht rot',
          !has(gr(2400,17),/Gang vor|nur \d+ mm Platz/) && !has(gr(2100,17),/nur \d+ mm Platz/,'bad') && has(gr(2100,17),/Gang vor Unterschrank 120 900 mm/,'warn'));
        chk('kueche-pruef: Gang – ein Millimeter unter der Grenze wird gemeldet (1199 gelb, 899 rot), kein Versatz des Strahls',
          has(gr(2399,17),/Gang vor Unterschrank 120 1199 mm/,'warn') && has(gr(2099,17),/Vor Unterschrank 120 nur 899 mm Platz/,'bad'));
        // Eine Zeile gegen die Wand, Plattentiefe 600: Gang = Raumtiefe − 600 (Nutzersicht-Befund: 1800 statt 1801 meldete „1199“)
        const g1=(H,deg)=>lay2(rotE(4000,H,deg),[row(1,1000,1200)]).F;
        chk('kueche-pruef: Gang vor einer Zeile bis zur Wand – 1200 mm genau ohne Meldung, 900 mm genau gelb, nicht rot (ungedreht und 17°)',
          [0,17].every(d=>!has(g1(1800,d),/Gang vor|nur \d+ mm Platz/) && !has(g1(1500,d),/nur \d+ mm Platz/,'bad') && has(g1(1500,d),/Gang vor Unterschrank 120 900 mm/,'warn')));
        const bar750=deg=>lay2(rotE(4000,3000,deg),[{id:1,kind:'island',x:2000,y:1500,rot:180,w:1800,d:900,bar:300}]).F;
        const tab750=deg=>lay2(rotE(4000,3000,deg),[{id:1,kind:'table',x:2000,y:1850,rot:0,w:1600,d:800}]).F;
        chk('kueche-pruef: Tresen und Tisch – genau 750 mm hinter Hockern und Stühlen sind im gedrehten Raum (17°, 90°, 133°) gelb, nicht rot',
          [17,90,133].every(d=>has(bar750(d),/Tresen: hinter den Hockern 750 mm/,'warn') && !has(bar750(d),/Tresen: hinter den Hockern nur/) && has(tab750(d),/Tisch: hinter den Stühlen 750 mm/,'warn') && !has(tab750(d),/Tisch: hinter den Stühlen nur/)));
        // Arbeitsdreieck an den Grenzen: Anzeige und Urteil beziehen sich auf dieselben 10 mm
        const tri3=(deg,xs)=>lay2(rotE(8000,4000,deg),[{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:xs[0],w:600},{id:2,kind:'base',dev:'hob',a:'A',b:'B',x:xs[1],w:600},{id:3,kind:'tall',dev:'fridge',a:'A',b:'B',x:xs[2],w:600}]).F;
        chk('kueche-pruef: Arbeitsdreieck im gedrehten Raum (17°): Schenkel 2700 und 1200 mm ohne Befund',
          !has(tri3(17,[0,2700,1350]),/Arbeitsdreieck/) && !has(tri3(17,[0,2400,1200]),/Arbeitsdreieck/));
        chk('kueche-pruef: Arbeitsdreieck – Schenkel 2704 mm zählt als „2,70 m“ ohne Befund, 2706 mm steht als „2,71 m (zu lang)“',
          !has(tri3(0,[0,2704,1352]),/Arbeitsdreieck/) && has(tri3(0,[0,2706,1353]),/Schenkel Spüle–Kochfeld 2,71 m \(zu lang\)/,'warn'));
        chk('kueche-pruef: Arbeitsdreieck – Schenkel genau 2705 mm (halbe 10 mm) zählt als „2,70 m“ in jedem Winkel, nicht mal so, mal so',
          [0,17,133,271,0.5].every(d=>!has(tri3(d,[0,2705,1350]),/Arbeitsdreieck/)));
        // Stichprobe vor der Spüle genau auf der Kante der Platte der Querzeile (Platte 600 tief, Spüle 600 breit, 300 vor der Ecke):
        // dort ist die Blindecke, in jedem Winkel, nicht mal Gang „1109 mm“
        const kante=deg=>lay2(rotE(4500,3500,deg),[{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:3600,w:600},row(2,4200,300),{id:3,kind:'base',a:'B',b:'C',x:660,w:450},{id:4,kind:'base',dev:'hob',a:'B',b:'C',x:1110,w:600}]).F;
        chk('kueche-pruef: Gang – Spüle mittig vor der Plattenkante der Querzeile: in jedem Winkel dieselbe Blindecke, kein Gang „1109 mm“', [0,17,133,271,0.5].every(d=>!has(kante(d),/Vor Spüle|Gang vor Spüle/)));
        // Schrank bündig am Ende der Hockerkante steht nicht hinter dem letzten Platz (Insel bis x 2900, Schrank ab x 2900)
        const buend=deg=>lay2(rotE(4500,3000,deg),[{id:1,kind:'island',x:2000,y:1486,rot:180,w:1800,d:900,bar:250},{id:2,kind:'base',a:'C',b:'D',x:1000,w:600}]).F;
        chk('kueche-pruef: Tresen – Schrank bündig am Ende der Hockerkante: in jedem Winkel kein Befund (nicht „nur 214 mm“)', [0,17,133,271,0.5].every(d=>!has(buend(d),/Tresen/)));
        // zwei gleichwertige Spülen (gleiche Summe, andere Schenkel zu kurz): im gedrehten Raum nicht anders gewählt
        const gl=deg=>lay2(rotE(8000,4000,deg),[{id:1,kind:'tall',dev:'fridge',a:'A',b:'B',x:0,w:600,hinge:'left'},hb(2400),sk(3,1000),sk(4,1400)]).F.filter(f=>/Arbeitsdreieck/.test(f.txt)).map(f=>f.txt);
        chk('kueche-pruef: Arbeitsdreieck – zwei gleichwertige Spülen: die Anzeige bleibt im gedrehten Raum (133°, 167°) dieselbe', gl(0).length===1 && [133,167].every(d=>gl(d).join()===gl(0).join()));
        // Spüle–Kochfeld mit mehreren Paaren: Insel-Spüle zählt nicht, jedes messbare Paar kann genügen
        const zs=items=>{ const f=lay2(mkE(4000,3000),items).F.find(x=>/Zwischen Spüle und Kochfeld/.test(x.txt)); return f ? f.txt : null; };
        chk('kueche-pruef: zwei Spülen – die auf der Insel ist nicht messbar und zählt nicht: die Wandspüle direkt neben dem Kochfeld wird gemeldet (0 mm)',
          /Zwischen Spüle und Kochfeld 0 mm/.test(zs([sk(1,0),hb(600),{id:5,kind:'island',dev:'sink',x:2000,y:1800,rot:0,w:1200,d:900}]) || ''));
        chk('kueche-pruef: zwei Spülen an der Wand – ist eine mit 900 mm Platte vom Kochfeld getrennt, bleibt es still, auch wenn die andere daneben steht',
          zs([sk(1,0),hb(600),row(3,1200,900),sk(5,2100)])===null);
      }
    }catch(err){ chk('kueche: Review-Fix Rest: pruef ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: wege ---
    try{
      // F1: Start/Ziel in der Aufweitung eines Hindernisses zählte das Hindernis
      // für den ganzen Weg nicht (skip) - Wege liefen mitten durch Tisch, Schrank, Kind.
      const inPoly=(p,P)=>TILES.pointInRing(p,P);
      const along=(path,f)=>{ for(let i=1;i<path.length;i++){ const a=path[i-1], b=path[i], n=Math.max(2,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/20));
        for(let t=0;t<=n;t++) if(f({x:a.x+(b.x-a.x)*t/n, y:a.y+(b.y-a.y)*t/n})) return true; } return false; };
      const foot=g=>g.foot||g.poly;
      {
        // Tisch 520 mm vor der Zeile: das Besteck steht in der Aufweitung des Tischs, der Tisch-Stand daneben.
        // Früher 1284 mm quer durch die Tischecke; der ehrliche Weg um sie liegt bei ≈ 1670 mm.
        const r=lay([{id:1,kind:'base',dev:'dw',a:'A',b:'B',x:100,w:600},{id:2,kind:'base',a:'A',b:'B',x:700,w:600,store:['besteck']},
          {id:3,kind:'base',a:'B',b:'C',x:2200,w:600,store:['teller']},{id:4,kind:'base',a:'A',b:'B',x:3300,w:600,store:['glaeser']},
          {id:5,kind:'table',x:1200,y:1500,rot:0,w:1200,d:800,seats:4}]);
        const St=KX.stations(E,r.K,r.L), w=KX.planner(E,r.L).route(St.besteck[0].p, St.tisch[0].p), tb=foot(r.L.byId.get(5));
        chk('kueche-wege: Start in der Aufweitung des Tischs – der Weg läuft um die Tischecke, nicht hindurch (und nicht kilometerweit außen herum)',
          w.ok && !along(w.path,p=>inPoly(p,tb)) && w.len>1284+100 && w.len<2000);
      }
      const Ea=KX.makeEnv(R.pts,R.walls,[door],[]);
      const Ka=KX.normKitchen({items:[
        {id:1,kind:'base',dev:'sink',a:'A',b:'B',x:600,w:600,store:['muell']},{id:2,kind:'base',dev:'dw',a:'A',b:'B',x:1200,w:600},
        {id:3,kind:'base',dev:'hob',a:'A',b:'B',x:2400,w:600},{id:4,kind:'base',a:'A',b:'B',x:1800,w:600,store:['besteck','messer']},
        {id:5,kind:'tall',dev:'fridge',a:'B',b:'C',x:0,w:600},{id:6,kind:'wall',a:'A',b:'B',x:1800,w:600,store:['teller','glaeser']},
        {id:7,kind:'base',a:'A',b:'B',x:3000,w:600,store:['toepfe','gewuerze']},{id:8,kind:'tall',a:'B',b:'C',x:600,w:600,store:['vorrat','tassen']},
        {id:9,kind:'table',x:2000,y:2000,rot:0,w:1200,d:800}]});
      const La=KX.layout(Ea,Ka), Ra=KX.flows(Ea,Ka,La);
      {
        // Ohne Kind: kein Weg läuft durch den Körper eines Teils, in dem keiner seiner Endpunkte steht
        // (die Kühlschrank-Station dieses Layouts liegt im Körper von Unterschrank 7: dort beginnt der Weg im Körper).
        const bodies=La.G.filter(g=>g.it.kind!=='wall').map(g=>foot(g));
        const through=Ra.flows.flatMap(f=>f.legs).filter(l=>l.ok && bodies.some(P=>!inPoly(l.path[0],P) && !inPoly(l.path[l.path.length-1],P) && along(l.path,p=>inPoly(p,P))));
        chk('kueche-wege: Wege laufen nicht durch fremde Schränke (Stand in der Aufweitung eines Nachbarn: ihn kurz verlassen, nicht durchqueren)', through.length===0);
        const leg=(R2,f,a,b)=>R2.flows.find(x=>x.key===f).legs.find(l=>l.from===a && l.to===b);
        chk('kueche-wege: Stand unter dem Hängeschrank (in der Aufweitung der Zeile) – der Weg weg vom Schrank bleibt gerade, kein Umweg',
          leg(Ra,'decken','teller','tisch').ok && leg(Ra,'decken','teller','tisch').len<560 && leg(Ra,'ausraeumen','dw','teller').len<700);
        // Kind mitten im Gang (Platz im Raum wie früher am Heatmap-Gipfel): was nicht im Körper des Kindes beginnt oder endet,
        // läuft nicht durch ihn - sondern außen herum oder ist gesperrt.
        const kc={x:2050,y:950}, Rk=KX.flows(Ea,Ka,La,{planner:KX.planner(Ea,La,[KX.kidPoly(kc)])});
        const ins=300*Math.cos(Math.PI/8);   // Innenkreis des Achtecks (≈ 277)
        const cut=Rk.flows.flatMap(f=>f.legs).filter(l=>l.ok && Math.hypot(l.path[0].x-kc.x,l.path[0].y-kc.y)>=300 && Math.hypot(l.path[l.path.length-1].x-kc.x,l.path[l.path.length-1].y-kc.y)>=300
          && along(l.path,p=>Math.hypot(p.x-kc.x,p.y-kc.y)<ins-1));
        const hobTisch=leg(Rk,'servieren','hob','tisch');
        chk('kueche-wege: Kind im Gang – Wege ohne Start oder Ziel im Kind laufen nicht durch es (Herd–Tisch außen herum oder gesperrt)',
          cut.length===0 && (!hobTisch.ok || hobTisch.len>leg(Ra,'servieren','hob','tisch').len) && Rk.flows.some(f=>f.blocked>0));
      }
      {
        // Zwei Aufgaben am selben Standpunkt im Körper des Kindes: man bleibt stehen (Länge 0).
        const pl=KX.planner(Ea,La,[KX.kidPoly({x:2050,y:950})]), p={x:2100,y:930};
        chk('kueche-wege: derselbe Standpunkt im Körper des Kindes – Weg 0', pl.route(p,p).ok && pl.route(p,p).len===0);
      }
      // F2: 'prep' nahm Frontmitte + 350 statt des Stands der Station (Über-Eck, Halbeck).
      {
        const items=[{id:1,kind:'base',corner:true,ctype:'L',a:'A',b:'B',x:0,w:900,store:['teller']},{id:4,kind:'base',a:'A',b:'D',x:900,w:600,dev:'dw'},
          {id:2,kind:'base',dev:'sink',a:'B',b:'C',x:1200,w:600},{id:3,kind:'base',dev:'hob',a:'A',b:'B',x:1500,w:600}];
        const r=lay(items), St=KX.stations(E,r.K,r.L), p=St.prep[0].p, t=St.teller[0].p;
        chk('kueche-wege: Über-Eck-Schrank als Arbeitsfläche – Stand auf der Diagonalen (wie seine Inhalte), nicht im Nachbarschrank',
          St.prep[0].id===1 && near(p.x,t.x,1e-6) && near(p.y,t.y,1e-6) && near(p.x,987,1) && !r.L.G.some(g=>g.it.id!==1 && inPoly(p,foot(g)))
          && typeof KX.standAt==='function' && near(KX.standAt(r.L.byId.get(1),r.K.spec).x,p.x,1e-6));
        const h=lay([{id:1,kind:'base',corner:true,a:'D',b:'A',x:2000,w:1000,front:'door',store:['teller']},{id:2,kind:'base',dev:'sink',a:'B',b:'C',x:1200,w:600},{id:3,kind:'base',dev:'hob',a:'B',b:'C',x:2000,w:600}]),
          Sh=KX.stations(E,h.K,h.L);
        chk('kueche-wege: Halbeck als Arbeitsfläche – Stand vor der Tür, nicht vor der Blende (wie Teller im selben Schrank)',
          Sh.prep[0].id===1 && near(Sh.prep[0].p.x,Sh.teller[0].p.x,1e-6) && near(Sh.prep[0].p.y,Sh.teller[0].p.y,1e-6));
        const g=lay([{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:600,w:600},{id:2,kind:'base',a:'A',b:'B',x:1200,w:600},{id:3,kind:'base',dev:'hob',a:'A',b:'B',x:1800,w:600}]), Sg=KX.stations(E,g.K,g.L), g2=g.L.byId.get(2);
        chk('kueche-wege: gerade Zeile – Arbeitsfläche unverändert 350 mm vor der Frontmitte', near(Sg.prep[0].p.x,g2.frontMid.x+g2.n.x*350,1e-6) && near(Sg.prep[0].p.y,g2.frontMid.y+g2.n.y*350,1e-6));
      }
      // F3: 'tisch' nahm die küchennächste Seite auch dann, wenn dort kein Stuhlraum ist (Stand im Nachbarmöbel).
      {
        const T3=items=>{ const r=lay(items), g=r.L.G.find(h=>h.it.kind==='table'), St=KX.stations(E,r.K,r.L), p=St.tisch[0].p, sd=KX.tableSides(g,E,r.L);
          return {r, g, p, sd, side:sd.find(s=>near(Math.hypot(p.x-s.mid.x,p.y-s.mid.y),350,1e-6) && near(Math.hypot(p.x-s.mid.x-s.n.x*350,p.y-s.mid.y-s.n.y*350),0,1e-6))}; };
        const a=T3([{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:600,w:600},{id:2,kind:'island',x:1900,y:1500,rot:0,w:1800,d:900},{id:3,kind:'table',x:3400,y:1500,rot:0,w:1200,d:800}]);
        chk('kueche-wege: Tisch Stirn an Stirn mit der Insel – der Stand liegt an einer Seite mit Stuhlraum, nicht in der Insel',
          !!a.side && a.side.open && !a.r.L.G.some(h=>h.it.kind!=='table' && h.it.kind!=='wall' && inPoly(a.p,foot(h))) && TILES.pointInRing(a.p,E.ring));
        const b=T3([{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:600,w:600},{id:3,kind:'table',x:2000,y:2000,rot:0,w:1200,d:800}]);
        const fm=b.r.L.G.filter(h=>h.it.kind!=='table' && h.it.kind!=='wall').map(h=>h.frontMid), c0={x:fm.reduce((s,q)=>s+q.x,0)/fm.length, y:fm.reduce((s,q)=>s+q.y,0)/fm.length};
        const old=b.sd.slice().sort((p,q)=>Math.hypot(p.mid.x-c0.x,p.mid.y-c0.y)-Math.hypot(q.mid.x-c0.x,q.mid.y-c0.y))[0];
        chk('kueche-wege: frei stehender Tisch (alle Seiten offen) – Stand wie bisher an der küchennächsten Seite', b.sd.every(s=>s.open) && near(b.p.x,old.mid.x+old.n.x*350,1e-6) && near(b.p.y,old.mid.y+old.n.y*350,1e-6));
        const z=T3([{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:1700,w:600},{id:3,kind:'table',x:2000,y:1500,rot:0,w:3400,d:2800}]);
        chk('kueche-wege: Tisch an allen Seiten zugestellt – trotzdem ein Stand, an der Seite mit dem meisten Platz', !!z.side && z.sd.every(s=>!s.open) && z.side.room===Math.max(...z.sd.map(s=>s.room)));
      }
    }catch(err){ chk('kueche: Review-Fix Rest: wege ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: inhalte ---
    try{
      // Meldung der Review-Gruppe „Inhalte“: G1 Fächer, G2 Anzahl je Fach, G3 Laden, G4 Küchenmaße zurücksetzen.
      // sf: eine fehlende Funktion oder Ausnahme macht nur diese Prüfung rot, nicht die übrigen.
      const sf=f=>{ try{ return !!f(); }catch(e){ return false; } };
      const S0=KX.K_DEF, tDw={kind:'tall',dev:'dw',a:'D',b:'A',x:0,w:600}, tOv={...tDw,dev:'oven'}, tMw={...tDw,dev:'mw'};
      const zk=(it,list,S)=>list.map(c=>KX.dwZoneFor({...it,store:list},S||S0,c).key);
      // G1: dwZoneFor legte jeden Untenzeug-Inhalt ins untere Fach, ohne den anderen Inhalt zu sehen.
      chk('kueche: hohe Spülmaschine – zwei Untenzeug-Inhalte liegen in verschiedenen Fächern, in jeder Reihenfolge gleich, der häufiger gebrauchte oben',
        sf(()=>{ const a=zk(tDw,['vorrat','toepfe']), b=zk(tDw,['toepfe','vorrat']);
          return KX.storeFits(tDw,S0,['vorrat','toepfe']) && a[0]==='unten' && a[1]==='oben' && b[0]==='oben' && b[1]==='unten'; }));
      chk('kueche: Backofen und Mikrowelle hoch – zwei Inhalte liegen in verschiedenen Fächern (nicht beide im besser greifbaren), in jeder Reihenfolge gleich',
        sf(()=>[tOv,tMw].every(it=>{ const a=zk(it,['teller','tassen']), b=zk(it,['tassen','teller']);
          return a[0]!==a[1] && a[0]===b[1] && a[1]===b[0] && a[0]==='unten'; })));
      chk('kueche: Hochschrank mit Gerät – wo storeFits passt, hat jeder Inhalt ein eigenes Fach, das ihn nimmt (alle Paare, Geräte, Höhen, Küchenmaße)',
        sf(()=>{ const keys=KX.CONTENTS.map(c=>c.key); let n=0, bad=0;
          [tDw,tOv,tMw].forEach(dev=>[undefined,1440,1700,2400].forEach(h=>[S0,{...S0,baseH:900},{...S0,plinth:100,tallH:2300}].forEach(S=>{
            const it={...dev,h}, take=(c,z)=>!z.only || z.only.includes(c);
            keys.forEach(a=>keys.forEach(b=>{ if(a>=b || !KX.storeFits(it,S,[a,b])) return; n++;
              const za=KX.dwZoneFor(it,S,a,[a,b]), zb=KX.dwZoneFor(it,S,b,[a,b]), ya=KX.dwZoneFor(it,S,a,[b,a]), yb=KX.dwZoneFor(it,S,b,[b,a]);
              if(!za || !zb || za.key===zb.key || !take(a,za) || !take(b,zb) || ya.key!==za.key || yb.key!==zb.key) bad++; })); })));
          return n>20 && bad===0; }));
      chk('kueche: hohe Spülmaschine – passt die Liste nicht (zu viele, zwei Geschirr-Inhalte), zählt jeder Inhalt allein; ein Inhalt allein bleibt wie bisher',
        sf(()=>{ const t=zk(tDw,['teller','tassen']), u=zk(tDw,['vorrat','toepfe','backen']);
          return !KX.storeFits(tDw,S0,['teller','tassen']) && t[0]==='oben' && t[1]==='oben' && u.every(k=>k==='unten')
            && KX.dwZoneFor(tDw,S0,'vorrat').key==='unten' && KX.dwZoneFor(tDw,S0,'teller').key==='oben'
            && KX.dwZoneFor({...tDw,store:['vorrat']},S0,'toepfe').key==='oben'           // ohne Eintrag: so, als käme er dazu
            && KX.dwZoneFor({...tDw,store:['vorrat']},S0,'toepfe',['toepfe']).key==='unten'; }));      // list ersetzt it.store
      {
        // Die Wege zählen die Fächer: zwei Untenzeug-Inhalte in der hohen Spülmaschine kosten weniger als die Summe ihrer
        // Einzelkosten (vorher gleich: beide wurden mit der Bodenhöhe gerechnet). Mit Belegung (assign) wie ohne.
        const items=[{id:1,kind:'base',a:'A',b:'B',x:600,w:600,dev:'sink'},{id:2,kind:'tall',dev:'dw',a:'A',b:'B',x:1200,w:600},
          {id:3,kind:'base',a:'A',b:'B',x:1800,w:600,dev:'hob'},{id:4,kind:'base',a:'B',b:'C',x:700,w:600},{id:5,kind:'tall',dev:'fridge',a:'B',b:'C',x:1300,w:600,store:['kuehl']}];
        chk('kueche: Wege – zwei Untenzeug-Inhalte in der hohen Spülmaschine kosten weniger als die Summe der Einzelkosten (mit Belegung)',
          sf(()=>{ const r=lay(items), base=KX.flows(E,r.K,r.L);
            const ev=a=>KX.flows(E,r.K,r.L,{assign:a,planner:base.planner,memo:base.memo,partial:true}).cost;
            const empty=Object.fromEntries(KX.CONTENTS.filter(c=>!c.fixed).map(c=>[c.key,[]])), E0=ev(empty), d=a=>ev({...empty,...a})-E0;
            const both=d({toepfe:[2],vorrat:[2]}), single=d({toepfe:[2]})+d({vorrat:[2]});
            return single>0 && both>0 && single-both>1; }));
        chk('kueche: Wege – dasselbe aus den eingetragenen Inhalten (ohne Belegung), und beides rechnet gleich',
          sf(()=>{ const cost=store=>{ const r=lay(items.map(it=>it.id===2 && store ? {...it,store} : it)); return KX.flows(E,r.K,r.L,{partial:true}).cost; };
            const c0=cost(null), both=cost(['toepfe','vorrat'])-c0, single=(cost(['toepfe'])-c0)+(cost(['vorrat'])-c0);
            const r=lay(items), base=KX.flows(E,r.K,r.L), empty=Object.fromEntries(KX.CONTENTS.filter(c=>!c.fixed).map(c=>[c.key,[]]));
            const ev=a=>KX.flows(E,r.K,r.L,{assign:{...empty,...a},planner:base.planner,memo:base.memo,partial:true}).cost;
            return single-both>1 && Math.abs((ev({toepfe:[2],vorrat:[2]})-ev({}))-both)<1e-6*Math.max(1,both); }));
      }
      // Umsortieren: reachDelta rechnet die Greifhöhe je Fach aus der Belegung vor und nach den Umzügen. Schubladenfach im
      // Unterschrank 1,04; hohe Spülmaschine: Untenzeug unten 2, oben 1,3. Bei zwei Untenzeug-Inhalten bekommt der
      // häufiger gebrauchte (Töpfe vor Vorräten vor Putzmitteln) das obere Fach.
      chk('kueche: Umsortieren – die Greifhöhe in der hohen Spülmaschine kommt aus allem, was dort vor bzw. nach den Umzügen liegt',
        sf(()=>{ const r=lay([{id:1,kind:'base',a:'A',b:'B',x:0,w:600,dev:'sink'},{id:2,kind:'tall',dev:'dw',a:'D',b:'A',x:800,w:600},{id:9,kind:'base',a:'B',b:'C',x:1700,w:600,front:'drawer'}]);
          const rd=(moves,start,cur)=>KX.reachDelta(r.K,r.L,moves,start,cur), eq=(x,y)=>Math.abs(x-y)<1e-9;
          return eq(rd([{c:'vorrat',from:2,to:9}], {vorrat:[2],putz:[2]}, {vorrat:[9],putz:[2]}), 1.04-1.3)      // Vorräte aus dem oberen Fach in die Schublade
            && eq(rd([{c:'toepfe',from:9,to:2}], {toepfe:[9],vorrat:[2]}, {toepfe:[2],vorrat:[2]}), 1.3-1.04)  // Töpfe ins obere Fach, Vorräte bleiben unten
            && eq(rd([{c:'vorrat',from:9,to:2}], {vorrat:[9]}, {vorrat:[2]}), 2-1.04)                          // allein im Fach: unten
            && rd([{c:'toepfe',from:null,to:2,place:true}], {}, {toepfe:[2]})===0; }));
      // G2 (Regressionsprüfung, auf main@5580aec schon behoben): fitStores kappt auch die Anzahl je Fach.
      chk('kueche: hohe Spülmaschine – Küchenmaße ändern und Laden räumen Inhalte aus, die zusammen in kein Fach mehr passen (je Fach einer, der erste bleibt)',
        sf(()=>{ const mk=(store,h)=>KX.normKitchen({items:[{...tDw,id:1,a:'A',b:'B',h,store}]});
          const K1=mk(['toepfe','vorrat']); K1.spec.tallH=1300; const n1=KX.fitStores(K1), it1=K1.items[0];
          const K2=mk(['toepfe','vorrat'],1400), K3=mk(['teller','tassen']), K4=mk(['teller','tassen','vorrat']);
          return n1===1 && JSON.stringify(it1.store)==='["toepfe"]' && KX.storeFits(it1,K1.spec,it1.store)
            && JSON.stringify(K2.items[0].store)==='["toepfe"]' && JSON.stringify(K3.items[0].store)==='["teller"]'
            && JSON.stringify(K4.items[0].store)==='["teller","vorrat"]'; }));
      // G3: Schlüssel aus der Datei, die Namen von Object.prototype tragen, ließen normItem werfen oder wurden still übernommen.
      chk('kueche: Laden – Schlüssel wie „toString“, „constructor“, „__proto__“ werfen nicht, der kaputte Teil fällt einzeln weg, der Nachbarschrank bleibt',
        sf(()=>{ const names=[...Object.getOwnPropertyNames(Object.prototype),'__proto__'], sib={id:9,kind:'base',a:'A',b:'B',x:700,w:600};
          const cases=nm=>[{kind:nm,a:'A',b:'B',x:0},{kind:nm,x:0,y:0},{kind:'base',a:'A',b:'B',x:0,dev:nm},{kind:'tall',a:'A',b:'B',x:0,dev:nm},{kind:'base',a:'A',b:'B',x:0,front:nm},
            {kind:'tall',dev:'fridge',a:'A',b:'B',x:0,fz:nm},{kind:'base',corner:true,a:'A',b:'B',x:0,inner:nm},{kind:'wall',corner:true,a:'A',b:'B',x:0,inner:nm},
            {kind:'base',corner:true,ctype:'L',a:'A',b:'B',x:0,inner:nm},{kind:'base',corner:true,ctype:'diag',a:'A',b:'B',x:0,inner:nm}];
          return names.every(nm=>cases(nm).every(o=>{ const K=KX.normKitchen(JSON.parse(JSON.stringify({items:[o,sib]})));
            const mine=K.items.filter(i=>i.id!==9), kindBad=o.kind===nm;
            return K.items.some(i=>i.id===9) && mine.length===(kindBad?0:1)
              && !K.items.some(i=>[i.kind,i.dev,i.front,i.fz,i.inner].some(v=>names.includes(v))); })); }));
      chk('kueche: Laden – gültige Schlüssel bleiben (Gerät, Front, Bauform, Eckschrank-Inneres) und zählen wie vorher',
        sf(()=>{ const K=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:0,w:600,dev:'sink',front:'door'},{id:2,kind:'tall',dev:'fridge',fz:'fd',a:'A',b:'B',x:700,w:900},
          {id:3,kind:'base',corner:true,ctype:'L',inner:'karussell',a:'A',b:'B',x:1700,w:900},{id:4,kind:'base',corner:true,inner:'schub',a:'A',b:'B',x:2700,w:1000},{id:5,kind:'island',x:2000,y:1500,w:1200,front:'drawer'}]});
          const g=id=>K.items.find(i=>i.id===id);
          return K.items.length===5 && g(1).dev==='sink' && g(1).front==='door' && g(2).fz==='fd' && g(3).inner==='karussell' && g(4).inner==='schub' && g(5).kind==='island'; }));
      chk('kueche: Laden – sehr viele Teile (200000) sprengen den Stapel nicht, die ids laufen weiter',
        sf(()=>{ const items=[]; for(let i=1;i<=200000;i++) items.push({id:i,kind:'base',a:'A',b:'B',x:i}); const K=KX.normKitchen({items});
          return K.items.length===200000 && K.seq===200001; }));
      // G4: „Standard“ unter den Küchenmaßen setzte über K_DEF auch die Annahme der Analyse (Personen) zurück.
      chk('kueche: Küchenmaße zurücksetzen – alle Maße auf Standard, Personen (Annahme der Analyse) und Eingang bleiben',
        sf(()=>{ const S={...S0, plinth:100, baseH:760, baseD:600, topT:30, topD:650, wallH:600, wallD:320, tallH:2200, tallD:700, faucetH:100, persons:2, entry:'o2'};
          KX.specReset(S);
          return Object.keys(S0).every(k=>k==='persons' ? S[k]===2 : S[k]===S0[k]) && S.entry==='o2'
            && KX.normKitchen({spec:{...S}}).spec.persons===2; }));
    }catch(err){ chk('kueche: Review-Fix Rest: inhalte ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: 3d ---
    try{
      // 3D „Fronten offen“, Ofen- und Schubladenhöhen. Jede Prüfung fängt eine
      // fehlende Funktion selbst ab (FAIL statt Abbruch des Blocks).
      const t3=(name,fn)=>{ let ok=false; try{ ok=!!fn(); }catch(e){ ok=false; } chk(name, ok); };
      const lay3=(items,spec)=>{ const K=KX.normKitchen({items,spec}); return {K, L:KX.layout(E,K)}; };
      const prs=(r,open,id=1)=>KX.scene(E,r.K,r.L,{open}).prisms.filter(p=>p.id===id);
      const at3=(P,z0,z1)=>P.some(p=>near(p.z0,z0,0.01) && near(p.z1,z1,0.01));
      const closed3=(r,g)=>KX.frontsOf(g, r.K.spec.plinth, r.L.D.workH-r.K.spec.topT, r.L.D, r.K.spec).slice().sort((p,q)=>p.z0-q.z0);
      // wie weit ein Prisma vor die Front des Teils ragt (gezogene Lade, offene Tür)
      const out3=(g,p)=>{ const n=g.n, f=g.front[0]; return Math.max(...p.poly.map(q=>(q.x-f.x)*n.x+(q.y-f.y)*n.y)); };
      const drawer={id:1,kind:'base',a:'A',b:'B',x:0,w:600};
      const ue={id:1,kind:'base',corner:true,front:'door',door:500,inner:'schub',a:'A',b:'D',x:0,w:1000};
      const herd={id:1,kind:'base',dev:'hob',a:'A',b:'B',x:0,w:600};
      const fd={id:1,kind:'tall',dev:'fridge',fz:'fd',a:'B',b:'C',x:500,w:900};
      // H1: Fronten ohne Hülle verschwanden in „Fronten offen“.
      t3('kueche-3d: Fronten offen – Schubladenstapel: untere Fronten bleiben zu, die oberste Lade ist gezogen und so hoch wie ihre Front', ()=>{
        const r=lay3([drawer]), g=r.L.G[0], fr=closed3(r,g), P=prs(r,true);
        return fr.length===3 && at3(P,fr[0].z0,fr[0].z1) && at3(P,fr[1].z0,fr[1].z1)
          && P.some(p=>near(p.z0,fr[2].z0-1.5,0.01) && near(p.z1,fr[2].z1+1.5,0.01) && out3(g,p)>400);
      });
      t3('kueche-3d: Fronten offen – Halbeckschrank mit Schubkasten behält die Blende zur Ecke, die Lade ist ganz gezogen', ()=>{
        const r=lay3([ue]), g=r.L.G[0], fr=closed3(r,g), bl=fr.find(f=>f.blind), dr=fr.find(f=>!f.blind && f.z0>400), P=prs(r,true);
        return !!bl && !!dr && at3(P,bl.z0,bl.z1) && P.some(p=>near(p.z0,dr.z0-1.5,0.01) && near(p.z1,dr.z1+1.5,0.01) && out3(g,p)>400);
      });
      t3('kueche-3d: Fronten offen – Herd: die Lade unter dem Backofen bleibt zu, die Ofenklappe liegt auf ihrer Oberkante', ()=>{
        const r=lay3([herd]), g=r.L.G[0], fr=closed3(r,g), P=prs(r,true), e=g.env.find(x=>x.what==='Backofentür');
        return fr.length===2 && !!e && at3(P,fr[0].z0,fr[0].z1) && at3(P,e.z0,e.z0+20) && near(fr[0].z1+1.5,e.z0,0.01);
      });
      t3('kueche-3d: Fronten offen – French Door: untere Gefrierlade bleibt zu, die obere ist gezogen und so hoch wie ihre Front', ()=>{
        const r=lay3([fd]), g=r.L.G[0], dr=KX.frontsOf(g,10,g.z1,r.L.D,r.K.spec).filter(f=>f.z1<1000).sort((p,q)=>p.z0-q.z0), P=prs(r,true);
        return dr.length===2 && at3(P,dr[0].z0,dr[0].z1) && P.some(p=>near(p.z0,dr[1].z0-1.5,0.01) && near(p.z1,dr[1].z1+1.5,0.01) && out3(g,p)>400);
      });
      // Gegenprobe: Teile, die nur Hüllen haben (Hochschrank mit Gerät) oder keine (Schiebetür), zeichnen offen wie bisher nichts doppelt und nichts weniger.
      t3('kueche-3d: Fronten offen – Hochschrank mit Gerät und Teil ohne Hülle bleiben wie sie waren (nichts doppelt, nichts fehlt)', ()=>{
        return ['oven','dw','mw'].every(dev=>{ const r=lay3([{id:1,kind:'tall',dev,a:'B',b:'C',x:500,w:600}]); return prs(r,true).length===prs(r,false).length && prs(r,false).length===5; })
          && (()=>{ const r=lay3([{id:1,kind:'base',front:'slide',a:'A',b:'B',x:0,w:900}]); return prs(r,true).length===prs(r,false).length; })();
      });
      // H6: die flache Lade oben, wie der Schubkasten im Eckschrank.
      t3('kueche-3d: Schubladenstapel – oben die flache Lade (wie der Schubkasten im Eckschrank), unten zwei hohe', ()=>{
        const r=lay3([drawer]), g=r.L.G[0], fr=closed3(r,g), h=f=>f.z1-f.z0, S=r.K.spec, D=r.L.D, hz=D.workH-S.topT-S.plinth;
        const rc=lay3([ue]), gc=rc.L.G[0], sc=closed3(rc,gc).filter(f=>!f.blind && f.z0>400)[0];
        return fr.length===3 && h(fr[2])<h(fr[1]) && near(h(fr[0]),h(fr[1]),0.01) && near(h(fr[2])+3,hz*KX.DRAWER_TOP,1e-6) && near(h(sc)+3,hz*KX.DRAWER_TOP,1e-6);
      });
      // H5: Ofenfront und Prüfhülle teilen sich eine Unterkante (Standard 270, wie die Hülle schon rechnete).
      t3('kueche-3d: Herd – Ofenfront beginnt auf der Höhe der Backofentür-Hülle (Standard 270 mm, auch bei anderem Sockel und Korpus)', ()=>{
        return [undefined, {plinth:100}, {plinth:200, baseH:780}, {baseH:900}].every(sp=>{
          const r=lay3([herd],sp), g=r.L.G[0], S=r.K.spec, o=closed3(r,g).find(f=>f.oven), e=g.env.find(x=>x.what==='Backofentür');
          return !!o && !!e && near(o.z0-1.5,e.z0,0.01) && near(e.z0, KX.ovenZ(S.plinth,r.L.D.workH-S.topT), 1e-9);
        }) && lay3([herd]).L.G[0].env.find(x=>x.what==='Backofentür').z0===270 && KX.ovenZ(150,870)===270;
      });
    }catch(err){ chk('kueche: Review-Fix Rest: 3d ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: zustand ---
    try{
      // Zustand der Bedienung (kitchen-ui läuft nicht im Selbsttest): die Regeln stehen als reine Funktionen im
      // kitchen-Block. Jeder Test schlägt bei fehlendem Helfer fehl statt zu werfen (sonst bliebe nur die Sammelzeile).
      const fn=n=>typeof KX[n]==='function';
      // I13: Prüfliste im Panel. Zwei gleich benannte Hochschränke, einer vorm Fenster, dann Platztausch: gleiche
      // Texte, andere ids. Der alte Schlüssel (nur Stufe, Text, Auswahl) war derselbe, die Handler hielten die alten ids.
      {
        const t1=(a,b,x)=>({id:1,kind:'tall',a,b,x,w:600}), t2=(a,b,x)=>({id:2,kind:'tall',a,b,x,w:600});
        const vor=lay([t1('A','B',1600), t2('B','C',1000)]).F, nach=lay([t1('B','C',1000), t2('A','B',1600)]).F;
        const win=F=>F.find(f=>/verdeckt ein Fenster/.test(f.txt)), oldKey=(F,sel)=>JSON.stringify(F.map(f=>[f.lvl,f.txt]))+sel;
        chk('kueche-zustand: Platztausch gleich benannter Hochschränke – gleiche Befundtexte, andere ids (Szenario)',
          !!win(vor) && !!win(nach) && win(vor).txt===win(nach).txt && win(vor).ids.join()==='1' && win(nach).ids.join()==='2' && oldKey(vor,1)===oldKey(nach,1));
        chk('kueche-zustand: Prüfliste – Schlüssel unterscheidet die ids (Platztausch baut die Knöpfe neu)',
          fn('checksKey') && KX.checksKey(vor,1)!==KX.checksKey(nach,1));
        chk('kueche-zustand: Prüfliste – Schlüssel stabil bei gleichem Stand, anders bei anderer Auswahl',
          fn('checksKey') && KX.checksKey(vor,1)===KX.checksKey(lay([t1('A','B',1600), t2('B','C',1000)]).F,1) && KX.checksKey(vor,1)!==KX.checksKey(vor,2));
        const fx=set=>[{lvl:'bad', txt:'Hochschrank 60: zu niedrig', ids:[1], fix:{label:'Standardhöhe', id:1, set, del:['h']}}];
        chk('kueche-zustand: Prüfliste – Schlüssel enthält die Abhilfe (Feld, Teil, Beschriftung)',
          fn('checksKey') && KX.checksKey(fx({x:10}),1)!==KX.checksKey(fx({x:20}),1)
          && KX.checksKey(fx({x:10}),1)!==KX.checksKey([{...fx({x:10})[0], fix:{...fx({x:10})[0].fix, id:2}}],1)
          && KX.checksKey(fx({x:10}),1)!==KX.checksKey([{...fx({x:10})[0], fix:null}],1));
      }
      // I14: Auswahl- und Eckenkasten hängen über wallEnds an der Ansichtsdrehung.
      {
        const it={id:1,kind:'base',a:'A',b:'B',x:100,w:600}, sp=KX.K_DEF, ck=KX.K_DEF.plinth+'|k';
        chk('kueche-zustand: Auswahl-Kasten – Schlüssel ändert sich mit der Ansichtsdrehung (links/rechts, Feldreihenfolge)',
          fn('selBoxKey') && KX.selBoxKey(it,sp,false,0)!==KX.selBoxKey(it,sp,false,Math.PI) && KX.selBoxKey(it,sp,false,0)!==KX.selBoxKey(it,sp,false,Math.PI/12)
          && KX.selBoxKey(it,sp,false,Math.PI)===KX.selBoxKey({...it},sp,false,Math.PI));
        chk('kueche-zustand: Auswahl-Kasten – Schlüssel hängt weiter an Teil, Maßen und Befund',
          fn('selBoxKey') && KX.selBoxKey(it,sp,false,0)!==KX.selBoxKey({...it,x:101},sp,false,0) && KX.selBoxKey(it,sp,false,0)!==KX.selBoxKey(it,{...sp,baseH:730},false,0)
          && KX.selBoxKey(it,sp,false,0)!==KX.selBoxKey(it,sp,true,0));
        chk('kueche-zustand: Ecken-Kasten – Schlüssel ändert sich mit der Ansichtsdrehung, nicht ohne',
          fn('cornerBoxKey') && KX.cornerBoxKey(it,ck,0)!==KX.cornerBoxKey(it,ck,Math.PI) && KX.cornerBoxKey(it,ck,Math.PI/2)===KX.cornerBoxKey({...it},ck,Math.PI/2)
          && KX.cornerBoxKey(it,ck,0)!==KX.cornerBoxKey(it,ck+'x',0) && KX.cornerBoxKey(it,ck,0)!==KX.cornerBoxKey({...it,x:5},ck,0));
      }
      // I15: Raumwechsel – was zu einem Raum gehört, geht zurück; Einstellungen und Zwischenablage bleiben.
      {
        const rb=fn('roomBound') ? KX.roomBound() : {};
        chk('kueche-zustand: Raumwechsel setzt zuletzt benutzte Wand, Referenz und scharfes „Alle entfernen“ zurück',
          ['lastWall','ref','clearArmed','sel','flow','hl','ctx'].every(k=>k in rb && rb[k]===null) && rb.drag===false && rb.ctxKey==='');
        chk('kueche-zustand: Raumwechsel lässt Einstellungen (3D, Wege, Analyse), Zwischenablage und Zwischenspeicher stehen',
          fn('roomBound') && !['show3d','paths','open','ana','heat','anaMode','kid','clip','ptr','mxOpen','flowKey','flowRes','suggKey','optKey','heatKey','swKey','anaKey'].some(k=>k in rb)
          && KX.roomBound()!==KX.roomBound());
      }
      // I16: Tastenzuständigkeit bei fokussiertem Drehregler (type=range).
      {
        const own=(k,tag,type)=>fn('controlOwnsKey') && KX.controlOwnsKey(k,tag,type);
        chk('kueche-zustand: Drehregler im Fokus – Pfeile, Pos1/Ende, Bild auf/ab gehören ihm (1° statt Insel schieben)',
          ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].every(k=>own(k,'INPUT','range')));
        chk('kueche-zustand: Kürzel (Q/E, V/W/O/A, F, Entf) und andere Elemente bleiben beim Plan',
          fn('controlOwnsKey') && ['q','e','v','w','o','a','f','Delete','Backspace','Escape'].every(k=>!own(k,'INPUT','range'))
          && !own('ArrowRight','BUTTON',undefined) && !own('ArrowRight','INPUT','checkbox') && !own('ArrowRight','INPUT','text') && !own('ArrowRight','DIV',undefined) && !own('ArrowRight',undefined,undefined));
      }
      // I12: gehaltene Taste speichert einmal statt je Wiederholung (Uhr eingehängt, kein Warten).
      {
        const clk=()=>{ let id=0; const q=new Map(); return {last:null, set(f,ms){ this.last=ms; q.set(++id,f); return id; }, clear(t){ q.delete(t); },
          tick(){ const a=[...q.values()]; q.clear(); a.forEach(f=>f()); }, n:()=>q.size}; };
        { const c=clk(); let runs=0; const d=fn('deferSave') ? KX.deferSave(()=>{ runs++; }, 400, c) : null;
          if(d) for(let i=0;i<60;i++) d.mark();
          chk('kueche-zustand: gehaltene Taste – 60 Wiederholungen speichern nicht, nur eine Uhr läuft (400 ms)', !!d && runs===0 && d.pending && c.n()===1 && c.last===400);
          chk('kueche-zustand: gehaltene Taste – Loslassen speichert genau einmal, danach nichts mehr',
            !!d && d.flush()===true && runs===1 && !d.pending && c.n()===0 && d.flush()===false && runs===1); }
        { const c=clk(); let runs=0; const d=fn('deferSave') ? KX.deferSave(()=>{ runs++; }, 400, c) : null;
          if(d){ d.mark(); d.mark(); c.tick(); }
          chk('kueche-zustand: fehlt das keyup, speichert die Ruhe-Uhr einmal', !!d && runs===1 && !d.pending && c.n()===0); }
        { const c=clk(); let runs=0; const d=fn('deferSave') ? KX.deferSave(()=>{ runs++; }, 400, c) : null;
          if(d){ d.mark(); d.cancel(); c.tick(); }
          chk('kueche-zustand: ein volles Speichern oder der Raumwechsel verwirft das Vorgemerkte (cancel)', !!d && runs===0 && !d.pending && c.n()===0 && d.flush()===false); }
        { const c=clk(); let runs=0, d=null; d=fn('deferSave') ? KX.deferSave(()=>{ runs++; d.cancel(); }, 400, c) : null;
          if(d){ d.mark(); d.flush(); }
          chk('kueche-zustand: speichern, das selbst cancel ruft (wie kitchenSave), läuft nicht doppelt', !!d && runs===1 && !d.pending && c.n()===0); }
        chk('kueche-zustand: ohne Vormerken tut flush nichts', fn('deferSave') && (()=>{ let runs=0; const d=KX.deferSave(()=>{ runs++; }, 400, clk()); return d.flush()===false && runs===0; })());
      }
    }catch(err){ chk('kueche: Review-Fix Rest: zustand ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: bedienung ---
    try{
      // (1) Duplizieren freier Teile (Insel, Tisch): die Kopie bleibt im Raum. Früher
      // n.x+=w+200 im Raumrahmen: ohne Platzprüfung, nicht in der Teilachse.
      {
        const cOk=typeof KX.copySpot==='function';
        const wl=(x,y)=>TILES.toLocal(E.F,{x,y});
        const dup=(items,id)=>{ const K=KX.normKitchen({items}), L=KX.layout(E,K), it=K.items.find(i=>i.id===id), n={...it, id:K.seq++};
          const old=KX.placeOk(E,K,L,{...n, x:n.x+n.w+200});          // die alte Regel
          return {K, L, it, n, old, s:cOk ? KX.copySpot(E,K,L,n) : null}; };
        const c3=wl(3000,1500), d1=dup([{id:1,kind:'island',x:c3.x,y:c3.y,rot:0,w:1800,d:900}],1);
        chk('kueche: Duplizieren – Insel nah an der rechten Wand: Kopie links daneben im Raum (alte Regel: ganz draußen)',
          !d1.old && !!d1.s && near(d1.s.x-d1.it.x,-2000,1e-6) && near(d1.s.y-d1.it.y,0,1e-6) && KX.placeOk(E,d1.K,d1.L,{...d1.n,x:d1.s.x,y:d1.s.y}));
        const c2=wl(2000,1500), d2=dup([{id:1,kind:'island',x:c2.x,y:c2.y,rot:90,w:1800,d:900}],1);
        chk('kueche: Duplizieren – gedrehte Insel: der Versatz folgt der Drehung, nicht dem Raumrahmen',
          !d2.old && !!d2.s && near(d2.s.x-d2.it.x,-1100,1e-6) && near(d2.s.y-d2.it.y,0,1e-6) && KX.placeOk(E,d2.K,d2.L,{...d2.n,x:d2.s.x,y:d2.s.y}));
        chk('kueche: Duplizieren – kein Platz: kein Duplikat (null), wie bei Wandteilen',
          cOk && dup([{id:1,kind:'island',x:c2.x,y:c2.y,rot:0,w:3800,d:900}],1).s===null);
        const c1=wl(1200,1500), t1=wl(2700,1500), d4=dup([{id:1,kind:'island',x:c1.x,y:c1.y,rot:0,w:1000,d:600},{id:2,kind:'table',x:t1.x,y:t1.y,rot:0,w:800,d:800}],1);
        chk('kueche: Duplizieren – Tisch im Weg: die nächste freie Seite (quer), 200 mm Luft',
          !d4.old && !!d4.s && near(d4.s.x-d4.it.x,0,1e-6) && near(d4.s.y-d4.it.y,800,1e-6));
        const d5=dup([{id:1,kind:'table',x:c3.x,y:c3.y,rot:0,w:1200,d:800}],1);
        chk('kueche: Duplizieren – Tisch wie Insel (1,2 m Breite + 200 mm Luft links daneben)',
          !d5.old && !!d5.s && near(d5.s.x-d5.it.x,-1400,1e-6));
        const t6=wl(2000,800), d6=dup([{id:1,kind:'island',x:t6.x,y:t6.y,rot:0,w:3600,d:600,bar:300}],1);
        chk('kueche: Duplizieren – Tresen quer: Überstand der Platte zählt zum Abstand (900 + 200 mm)',
          !d6.old && !!d6.s && near(d6.s.x-d6.it.x,0,1e-6) && near(d6.s.y-d6.it.y,1100,1e-6) && KX.placeOk(E,d6.K,d6.L,{...d6.n,x:d6.s.x,y:d6.s.y}));
      }
      // (2) Kurve „Verschieben und vergleichen“: Lücken nur, wo eine Rasterlage fehlt.
      // Die jetzige Lage (600) liegt neben dem 70-mm-Raster der Wand und stellte als
      // kleinster Abstand (30) den Schritt: fast jedes Stück galt als Lücke.
      {
        const gOk=typeof KX.sweepGaps==='function';
        const E4=KX.makeEnv(R.pts,R.walls,[],[]);
        const wall=items=>{ const K=KX.normKitchen({items}), L=KX.layout(E4,K); return KX.sweep(E4,K,L,2).axes[0]; };
        const base=[{id:1,kind:'base',a:'A',b:'B',x:0,w:600},{id:2,kind:'base',a:'A',b:'B',x:600,w:600,dev:'sink'}];
        const a0=wall(base), a1=wall([...base,{id:3,kind:'base',a:'A',b:'B',x:2600,w:600,dev:'hob'}]);
        const minD=P=>Math.min(...P.slice(1).map((p,i)=>p.v-P[i].v));
        chk('kueche: Kurve – jetzige Lage neben dem Raster (Vorbedingung: kleinster Abstand 30 < Schritt 70)',
          near(a0.cur,600,1e-9) && minD(a0.pts)===30 && a0.pts.some(p=>p.v===630) && a0.pts.some(p=>p.v===700));
        chk('kueche: Kurve – frei bis zum Wandende: keine Lücke, die Linie läuft durch',
          gOk && KX.sweepGaps(a0.pts,a0.cur).length===a0.pts.length && !KX.sweepGaps(a0.pts,a0.cur).some(Boolean));
        const g1=gOk ? KX.sweepGaps(a1.pts,a1.cur) : [];
        chk('kueche: Kurve – Herd sperrt Lagen: genau eine Lücke (zwischen 1960 und 3220), nicht eine je Stück',
          gOk && g1.filter(Boolean).length===1 && a1.pts[g1.indexOf(true)].v===3220 && a1.pts[g1.indexOf(true)-1].v===1960);
        const R7=rect(7000,3000), E7=KX.makeEnv(R7.pts,R7.walls,[],[]), p1=TILES.toLocal(E7.F,{x:800,y:1500}), p2=TILES.toLocal(E7.F,{x:1500,y:1500});
        const K7=KX.normKitchen({items:[{id:1,kind:'island',x:p1.x,y:p1.y,rot:0,w:1000,d:600},{id:2,kind:'table',x:p2.x,y:p2.y,rot:0,w:200,d:600}]});
        const ax7=KX.sweep(E7,K7,KX.layout(E7,K7),1).axes.find(a=>a.key==='u'), g7=gOk ? KX.sweepGaps(ax7.pts,ax7.cur) : [];
        chk('kueche: Kurve – freie Achse (Insel längs, Tisch im Weg): eine Lücke vor 1300',
          gOk && g7.filter(Boolean).length===1 && ax7.pts[g7.indexOf(true)].v===1300 && ax7.pts[g7.indexOf(true)-1].v===100);
      }
      // (3) Bedienzustand der Küche in der Meldung: nur Gültiges kommt durch.
      {
        const uOk=typeof KX.normUi==='function';
        const Ku=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:0,w:600},{id:5,kind:'tall',a:'B',b:'C',x:0,w:600,dev:'dw'}]});
        const raw={sel:5, open:true, flow:'kochen', anaMode:'run', kid:true, heat:false, ana:true, paths:false, show3d:false,
                   ref:{kmYear:31.5, flows:{kochen:{week:100,m:12.5}, quatsch:{week:1,m:1}, snack:{week:'x',m:2}}}};
        const u=uOk ? KX.normUi(JSON.parse(JSON.stringify(raw)),Ku) : null;
        chk('kueche: Bedienzustand aus der Meldung – Teil, Fronten, Ablauf, Analyse, Kind, Referenz kommen durch',
          !!u && u.sel===5 && u.open===true && u.flow==='kochen' && u.anaMode==='run' && u.kid===true && u.heat===false
          && u.ana===true && u.paths===false && u.show3d===false && u.ref.kmYear===31.5 && u.ref.flows.kochen.m===12.5
          && Object.keys(u.ref.flows).join()==='kochen');
        const b=uOk ? KX.normUi({sel:99, open:'ja', flow:'nix', anaMode:'x', kid:1, heat:0, ana:'1', ref:{kmYear:'a', flows:{}}},Ku) : null;
        chk('kueche: Bedienzustand – Ungültiges fällt auf den Standard (kein Teil 99, kein Ablauf „nix“, Modus Jahr)',
          !!b && b.sel===null && b.open===false && b.flow===null && b.anaMode==='week' && b.kid===false && b.heat===true && !('ana' in b) && b.ref===null);
        chk('kueche: Bedienzustand – fehlend, null, Text, Zahl: Standard',
          uOk && [undefined,null,'x',5].every(v=>{ const r=KX.normUi(v,Ku); return r.sel===null && r.ref===null && r.anaMode==='week' && r.heat===true; }));
      }
      // (4) Öffnungs-ids: bei doppelter numerischer id gewinnt die ERSTE (Fremdimport).
      {
        const ops=[{id:7,kind:'door'},{id:7,kind:'window'}], rr=globalThis.normOpeningIds(ops,3);
        const room={opmeas:[{id:'om1',op:7}], shared:{'A|B':{room:'r2',wall:['A','B'],tuer:{op:7}}}, kitchen:{spec:{entry:7}}};
        globalThis.remapOpeningRefs(room,rr.map);
        chk('kueche: doppelte numerische Öffnungs-id – Lagemaß, Nachbartür und Eingang bleiben an der ersten Öffnung',
          ops[0].id==='7' && ops[1].id==='o3' && rr.map.get(7)==='7' && room.opmeas[0].op==='7'
          && room.shared['A|B'].tuer.op==='7' && room.kitchen.spec.entry==='7');
        const so=[{id:'a b'},{id:'a b'},{id:'o1'}], rs=globalThis.normOpeningIds(so,2);
        chk('kueche: doppelte ungültige Text-id – die erste bekommt die neue id und behält die Verweise',
          so.map(o=>o.id).join()==='o2,o3,o1' && rs.map.get('a b')==='o2');
      }
      // (5) Texte: Listen mit „ · “ (Inhaltsnamen enthalten Kommas), Rückgängig als eigener Satz.
      {
        const rl=typeof KX.roleList==='function', uh=typeof KX.undoHint==='function';
        chk('kueche: Liste „fehlt: …“ – Inhaltsnamen mit Komma bleiben unterscheidbar („ · “ statt Komma)',
          rl && KX.roleList(['messer','vorrat'])==='Messer, Bretter · Vorräte' && KX.roleList(['eingang'])==='Eingang' && KX.roleList([])===''
          && KX.roleList(['sink','x'])==='Spüle · x');
        chk('kueche: Hinweis nach einer Liste – „⌘Z nimmt es zurück“ als eigener Satz, kein Listenelement',
          uh && KX.undoHint('bleibt gegen die Regel: Besteck · Messer, Bretter')==='bleibt gegen die Regel: Besteck · Messer, Bretter. ⌘Z nimmt es zurück'
          && !KX.undoHint('A · B').includes(' · ⌘Z'));
        // Einheiten im Plan: Kette in mm, Schrankbreite in cm (Nennmaß); Kasten nur, wenn er in die Strecke passt (dimLabel misst zuerst).
        chk('kueche: Plan nennt die Einheiten (Maße mm, Schrankbreite cm); 200-mm-Lücke bei 21 px: Kasten „200“ (25 px) kommt neben die Strecke',
          typeof KX.DIM_NOTE==='string' && /Maße in mm/.test(KX.DIM_NOTE) && /Schrankbreite in cm/.test(KX.DIM_NOTE)
          && !KX.dimFits({x:0,y:0},{x:21,y:0},25,15,2) && KX.dimFits({x:0,y:0},{x:21,y:0},12,15,2));
      }
      // (6) Testabdeckung der Küche: verwaiste Wand, leere Küche und der Weg durch die Datei.
      {
        // Wand geteilt: die alte Wand A–B gibt es nicht mehr, ihr Teil ist verwaist und wird gemeldet.
        const Rs={pts:[...R.pts,{id:'E',x:2000,y:0}], walls:[['A','E'],['E','B'],['B','C'],['C','D'],['D','A']]};
        const Es=KX.makeEnv(Rs.pts,Rs.walls,[],[]), Ks=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:0,w:600},{id:2,kind:'base',a:'A',b:'E',x:0,w:600}]});
        const Ls=KX.layout(Es,Ks), Fs=KX.check(Es,Ks,Ls);
        chk('kueche: Wand geteilt – das Teil an der alten Wand ist verwaist und wird als „hängt an einer Wand, die es nicht mehr gibt“ gemeldet',
          Ls.orphans.length===1 && Ls.orphans[0].id===1 && Ls.byId.has(2) && !Ls.byId.has(1)
          && Fs.some(f=>f.lvl==='bad' && f.ids.join()==='1' && /hängt an einer Wand, die es nicht mehr gibt/.test(f.txt)));
        // serialize lässt eine leere Küche weg: Küchenmaß, Personen, Eingang oder ein Teil machen sie nicht leer.
        const nk=o=>KX.normKitchen(o);
        chk('kueche: leer = nichts geplant und nichts umgestellt (Personen 2, Eingang, Küchenmaß, ein Teil: nicht leer; Bezugsecke allein: leer)',
          KX.isEmpty(null) && KX.isEmpty(nk(null)) && KX.isEmpty(nk({frame:{a:'A',b:'B'}}))
          && !KX.isEmpty(nk({spec:{persons:2}})) && !KX.isEmpty(nk({spec:{entry:'o2'}})) && !KX.isEmpty(nk({spec:{plinth:100}}))
          && !KX.isEmpty(nk({items:[{id:1,kind:'base',a:'A',b:'B',x:0,w:600}]})));
        // serialize -> JSON -> normKitchen (deserialize) verliert nichts.
        const Kr=nk({spec:{persons:2,plinth:100,entry:'o2'}, frame:{a:'B',b:'C'}, seq:9,
          items:[{id:3,kind:'base',a:'A',b:'B',x:600,w:600,dev:'sink',front:'door',hinge:'right',store:['teller','glaeser']},
                 {id:4,kind:'island',x:1500.5,y:900,rot:20,w:1800,d:900,bar:300},{id:6,kind:'tall',a:'B',b:'C',x:0,w:600,dev:'dw'}]});
        const Kj=nk(JSON.parse(JSON.stringify(Kr)));
        chk('kueche: Küche -> JSON -> normKitchen verliert nichts (Küchenmaße, Eingang, Bezugsecken, Zähler, Teile samt Inhalt), zweites Mal dasselbe',
          Kr.items.length===3 && Kr.spec.persons===2 && Kr.spec.entry==='o2' && Kr.seq===9 && Kr.frame.a==='B'
          && JSON.stringify(Kj)===JSON.stringify(Kr) && JSON.stringify(nk(JSON.parse(JSON.stringify(Kj))))===JSON.stringify(Kj));
        // Abläufe mit demselben K, das auch das Layout bekam (so ruft die App): gleich einer gleichwertigen Kopie.
        const its=[{id:1,kind:'base',a:'A',b:'B',x:0,w:600,dev:'sink'},{id:2,kind:'base',a:'A',b:'B',x:600,w:600,dev:'hob'},{id:3,kind:'tall',a:'B',b:'C',x:0,w:600,dev:'fridge'},
                   {id:4,kind:'base',a:'A',b:'B',x:1200,w:600,store:['muell','vorrat']}];
        const Ka=nk({items:its}), La=KX.layout(E,Ka), fa=KX.flows(E,Ka,La), fb=KX.flows(E,nk({items:its}),La);
        chk('kueche: Abläufe mit demselben K wie das Layout (App-Aufruf) = mit einer gleichwertigen Kopie (mindestens ein Ablauf vollständig)',
          fa.kmYear>0 && fa.complete>=1 && near(fa.kmYear,fb.kmYear,1e-9) && fa.complete===fb.complete);
      }
    }catch(err){ chk('kueche: Review-Fix Rest: bedienung ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: etiketten ---
    try{
      // Führungslinien der Stationsetiketten (Nachprüfung der Etiketten-Fixes):
      // Segment gegen Segment statt nur Kasten, Ansatzpunkt am Kasten wählbar,
      // dichtere Richtungen. Mess-Stub 0,6 em, kleiner Plan um q=(300,300).
      const measure=(t,f)=>t.length*f.px*0.6, ovA=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1e-3 && Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1e-3, hits=(a,b,R)=>{ for(let i=0;i<=400;i++){ const t=i/400, x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t; if(x>R.x && x<R.x+R.w && y>R.y && y<R.y+R.h) return true; } return false; };
      const segX=(a,b,c,d)=>globalThis.CORE.segCross(a,b,c,d);
      const q0={x:300,y:300}, o0={dpr:1, measure};
      const nearD=r=>Math.hypot(Math.min(Math.max(q0.x,r.x),r.x+r.w)-q0.x, Math.min(Math.max(q0.y,r.y),r.y+r.h)-q0.y);
      const mk=()=>{ const LP=CORE.labelPlacer(); LP.occupy({x:q0.x-5,y:q0.y-5,w:10,h:10,hard:true}); LP.occupy({x:q0.x-26,y:q0.y-26,w:52,h:52}); return LP; };   // Ringe 0/1 gesperrt
      // Nur ein Gang nach rechts frei (Mitte ±14), links, oben und unten zu.
      const gang=()=>{ const LP=mk(); LP.occupy({x:0,y:0,w:700,h:q0.y-14}); LP.occupy({x:0,y:q0.y+14,w:700,h:400}); LP.occupy({x:0,y:0,w:q0.x-30,h:700}); return LP; };
      {
        // (a) Eine schon gezogene Linie steht senkrecht rechts von q: der Kasten bei 0° wäre frei (die Linie läuft
        //     nicht hindurch), die Linie zu ihm kreuzte sie aber – stattdessen ein Platz ohne Kreuzung.
        const LP=mk(), prior=[{x:q0.x+25,y:q0.y-80},{x:q0.x+25,y:q0.y+80}]; LP.leads=[prior];
        const s=KX.stationLabel(LP,q0,['vorrat'],o0);
        chk('kueche: Führungslinie kreuzt keine schon gezogene Linie, wenn es einen anderen freien Platz gibt (Segment gegen Segment)',
          s && !s.forced && s.r.k>=2 && s.lead && !segX(q0,s.lead,prior[0],prior[1]) && !hits(prior[0],prior[1],s.r) && LP.leads.length===2);
        // Nur ein Gang frei, die Linie muss kreuzen: trotzdem ein Platz (nicht erzwungen).
        const L2=gang(); L2.leads=[[{x:q0.x+25,y:q0.y-12},{x:q0.x+25,y:q0.y+12}]];
        const s2=KX.stationLabel(L2,q0,['vorrat'],o0);
        chk('kueche: Führungslinie – ist jeder Platz gekreuzt, bleibt ein Platz mit nur einer Kreuzung (nicht erzwungen)', s2 && !s2.forced && s2.lead && s2.r.k>=2);
      }
      {
        // (b) Maßzahl genau auf dem Weg zum nächsten Punkt des Kastens, Gang nach rechts: die Linie endet an einer
        //     anderen Stelle des Kastens und läuft über der Zahl vorbei – früher mitten durch.
        const LP=gang(), num={x:q0.x+18,y:q0.y-2,w:8,h:4,hard:true}; LP.occupy(num);
        const s=KX.stationLabel(LP,q0,['vorrat'],o0);
        const onBox=p=>p.x>=s.r.x-1e-6 && p.x<=s.r.x+s.r.w+1e-6 && p.y>=s.r.y-1e-6 && p.y<=s.r.y+s.r.h+1e-6;
        chk('kueche: Führungslinie läuft nicht durch eine Maßzahl, wenn ein anderer Randpunkt des Kastens frei erreichbar ist (Ansatzpunkt wählbar)',
          s && !s.forced && s.lead && onBox(s.lead) && !hits(q0,s.lead,num) && Math.hypot(s.lead.x-q0.x,s.lead.y-q0.y)<=nearD(s.r)+30+1e-6);
      }
      {
        // (c) Dichte Richtungen: ein Gang, in dem nur das Etikett bei 5,6° (zwischen den 16 Hauptrichtungen) frei ist –
        //     es steht dort ganz nah am Punkt statt erzwungen über einem Hindernis.
        const LP=CORE.labelPlacer(); LP.occupy({x:q0.x-5,y:q0.y-5,w:10,h:10,hard:true});
        LP.occupy({x:0,y:0,w:700,h:q0.y-4}); LP.occupy({x:0,y:q0.y+13,w:700,h:400}); LP.occupy({x:0,y:0,w:q0.x-1,h:700});
        const s=KX.stationLabel(LP,q0,['hob'],o0);
        chk('kueche: Stationsetikett zwischen den Hauptrichtungen – freier Platz nahe am Punkt statt erzwungen (64 Richtungen)', !!s && !s.forced && s.r.k<=1 && !s.lead);
      }
      {
        // (d) Eine schon gezogene Linie läuft durch den ersten nahen Platz (rechts neben dem Punkt): das Etikett
        //     weicht auf einen anderen nahen Platz aus, statt von der fremden Linie durchquert zu werden.
        const LP=CORE.labelPlacer(); LP.occupy({x:q0.x-5,y:q0.y-5,w:10,h:10,hard:true});
        const prior=[{x:q0.x+18,y:q0.y-60},{x:q0.x+18,y:q0.y+60}]; LP.leads=[prior];
        const s=KX.stationLabel(LP,q0,['hob'],o0);
        chk('kueche: nahes Stationsetikett steht nicht in einer schon gezogenen Führungslinie (Ring 0/1 gegen frühere Linien)',
          !!s && !s.forced && s.r.k<=1 && !s.lead && !hits(prior[0],prior[1],s.r) && LP.leads.length===1);
      }
      {
        // Passt Kopfzeile + Inhalt als Block nirgends ganz ins Teil (schräge Ansicht, kleiner Maßstab), kommt der
        // Inhalt trotzdem hin, wenn nur sein Kern ins Teil muss – unter die stehende Kopfzeile oder mit ihr als
        // Block (die Kopfzeile darf rücken). Früher fiel er ganz weg. Nichts überlappt, nichts ragt aus dem Teil.
        const Ep=KX.makeEnv([{id:'A',x:0,y:0},{id:'B',x:4500,y:0},{id:'C',x:4500,y:3500},{id:'D',x:0,y:3500}],[['A','B'],['B','C'],['C','D'],['D','A']],[],[]);
        const Lp=KX.layout(Ep,KX.normKitchen({items:[{id:1,kind:'tall',front:'door',w:600,a:'A',b:'B',x:1000,store:['teller','glaeser','tassen']},
          {id:2,kind:'base',front:'drawer',w:900,a:'A',b:'B',x:2000,store:['besteck','teller']}]}));
        const at=(s,deg)=>{ const c=Math.cos(deg*Math.PI/180), sn=Math.sin(deg*Math.PI/180), toScr=p=>({x:(p.x*c-p.y*sn)*s+400, y:(p.x*sn+p.y*c)*s+400});
          return {toScr, lab:KX.planLabels(Lp,{toScr, dpr:1, measure}).labels}; };
        const ok=(v,id,txt)=>{ const g=Lp.byId.get(id), P=(g.outline||g.poly).map(v.toScr), head=v.lab.find(l=>l.id===id && l.role==='head'), sub=v.lab.filter(l=>l.id===id && l.role==='sub');
          return !!head && sub.length>0 && sub.every(l=>KX.rectIn(l.r,P) && !ovA(l.r,head.r) && Math.abs(l.x-head.x)<0.5) && (!txt || sub[0].txt===txt); };
        chk('kueche: Inhalt unter der stehenden Kopfzeile, wenn der Block nicht ganz ins Teil passt (schräge Ansicht, Kern im Teil)', ok(at(0.045,70),2,'+2'));
        chk('kueche: Inhalt als Block mit der Kopfzeile, wenn nur der Kern ins Teil muss (Hochschrank, kleiner Maßstab: „60“ + „+3“)', ok(at(0.05,0),1,'+3'));
        let all=true; for(let s=0.03;s<=0.13;s+=0.01) for(let deg=0;deg<90;deg+=5){ const w=at(s,deg);
          all=all && Lp.G.every(g=>{ if(g.wing) return true; const P=(g.outline||g.poly).map(w.toScr); return w.lab.filter(l=>l.id===g.it.id).every(l=>KX.rectIn(l.r,P)); })
            && w.lab.every((a,i)=>w.lab.every((b,j)=>j<=i || !ovA(a.r,b.r))) && [1,2].every(id=>w.lab.some(l=>l.id===id && l.role==='head') || s<0.04); }
        chk('kueche: Etiketten mit Inhalt (Maßstab 0,03–0,13, 0–85°) – im Teil, überlappen nicht, Kopfzeile bleibt', all);
      }
      {
        // Schritt 5 kürzt keine Kopfzeile (Breite geht dem Inhalt vor): der Hängeschrank 4 (45 cm, vier Inhalte, im
        // Gedränge über Hochschrank und Hängeschränken) stand als „H 45“; im neuen Block ohne Gegenprüfung wurde daraus
        // „H“ mit „+4“ (Maßstab 0,108, 318,5°, dpr 1,5; Mess-Stub 0,57/0,64 em).
        const m2=(t,f)=>String(t).length*f.px*(f.weight>=600?0.64:0.57);
        const Ed=KX.makeEnv([{id:'A',x:0,y:0},{id:'B',x:5856,y:0},{id:'C',x:5856,y:4133},{id:'D',x:0,y:4133}],[['A','B'],['B','C'],['C','D'],['D','A']],[],[]);
        const Ld=KX.layout(Ed,KX.normKitchen({items:[
          {id:1,a:'B',b:'C',x:2020,w:600,store:['besteck','glaeser','messer','gewuerze'],kind:'base',front:'door',dev:'dw'},
          {id:2,a:'C',b:'D',x:5080,w:400,store:['toepfe','muell'],kind:'wall',front:'door'},
          {id:3,a:'B',b:'C',x:1080,w:300,store:['messer'],kind:'wall',front:'open'},
          {id:4,a:'B',b:'C',x:1640,w:450,store:['tassen','messer','gewuerze','putz'],kind:'wall',front:'open'},
          {id:5,a:'B',b:'C',x:1150,w:1000,store:['teller','gewuerze','backen','kuehl'],kind:'tall',front:'door'},
          {id:6,a:'B',b:'C',x:1370,w:800,store:['besteck','vorrat','muell','kuehl'],kind:'wall',front:'open'}]}));
        const sd=0.10770836797282633, rd=5.5584659720988965, dd=1.5, cd=Math.cos(rd), snd=Math.sin(rd);
        const toScrD=p=>({x:(p.x*cd-p.y*snd)*sd*dd+589.6680780686438, y:(p.x*snd+p.y*cd)*sd*dd+532.8586620278656});
        const labD=KX.planLabels(Ld,{toScr:toScrD, dpr:dd, measure:m2}).labels.filter(l=>l.id===4);
        chk('kueche: Schritt 5 kürzt die Kopfzeile nicht (Hängeschrank bleibt „H 45“, kein „H“ mit „+4“)', labD.some(l=>l.role==='wall' && l.txt==='H 45'));
        // vier weitere Ansichten (Maßstab, Drehung in 64 Schritten), in denen die Sperre den Unterschied macht (ohne sie „H“ + „+4“)
        const labAt=(s,k)=>{ const r=k*Math.PI*2/64, c=Math.cos(r), n=Math.sin(r);
          return KX.planLabels(Ld,{toScr:p=>({x:(p.x*c-p.y*n)*s*dd+589.67, y:(p.x*n+p.y*c)*s*dd+532.86}), dpr:dd, measure:m2}).labels.filter(l=>l.id===4); };
        chk('kueche: Schritt 5 kürzt die Kopfzeile auch in vier weiteren Ansichten nicht (Maßstab 0,088 bis 0,144), „H 45“ bleibt',
          [[0.088,9],[0.092,57],[0.112,21],[0.144,62]].every(([s,k])=>labAt(s,k).some(l=>l.role==='wall' && l.txt==='H 45')));
      }
      {
        // Inhalt in schräger Ansicht rückt zur Seite, wo der waagerechte Schnitt des schrägen Teils unter der
        // Kopfzeile nicht reicht: Insel 1,2 m × 0,6 m mit „Besteck“, 35–55°, Maßstab 0,075. Früher fiel er ganz weg,
        // weil nur genau unter der Kopfzeile gesucht wurde.
        const Ei=KX.makeEnv([{id:'A',x:0,y:0},{id:'B',x:4500,y:0},{id:'C',x:4500,y:3500},{id:'D',x:0,y:3500}],[['A','B'],['B','C'],['C','D'],['D','A']],[],[]);
        const Li=KX.layout(Ei,KX.normKitchen({items:[{id:1,kind:'island',front:'drawer',w:1200,d:600,x:2200,y:1700,rot:0,store:['besteck']}]}));
        const okI=deg=>{ const c=Math.cos(deg*Math.PI/180), sn=Math.sin(deg*Math.PI/180), toScr=p=>({x:(p.x*c-p.y*sn)*0.075+400, y:(p.x*sn+p.y*c)*0.075+400});
          const lab=KX.planLabels(Li,{toScr, dpr:1, measure}).labels, g=Li.byId.get(1), P=(g.outline||g.poly).map(toScr), head=lab.find(l=>l.role==='head'), sub=lab.filter(l=>l.role==='sub');
          return !!head && sub.length===1 && sub[0].txt==='Besteck' && KX.rectIn(sub[0].r,P) && !ovA(sub[0].r,head.r) && Math.abs(sub[0].x-head.x)>1; };
        chk('kueche: Inhalt rückt in schräger Ansicht zur Seite, wo unter der Kopfzeile der Schnitt des schrägen Teils nicht reicht (Insel 35–55°)', [35,45,55].every(okI));
      }
      {
        // Punkt des Eingangs gegen seine Pille: berührt er sie (mit 3 px Luft), entfällt er – früher ragte er als halbe
        // Beule über den Rand. Pille 90 × 17 um (100,100): Rand x 55…145, y 91,5…108,5; Punkt r 4,5.
        const pill={q:{x:100,y:100}, w:90, h:17}, t=(x,y)=>KX.pillTouch({x,y},pill,4.5,3);
        chk('kueche: Wegepunkt des Eingangs entfällt unter der Pille, am Rand (halbe Beule) und mit weniger als 3 px Luft',
          t(100,100) && t(100,91.5) && t(100,85) && t(150,100));
        chk('kueche: Wegepunkt des Eingangs bleibt, wo er frei neben der Pille steht (auch schräg über der Ecke)',
          !t(100,83) && !t(160,100) && !t(151,85) && t(150,86));
      }
    }catch(err){ chk('kueche: Review-Fix Rest: etiketten ohne Ausnahme ('+err.message+')', false); }
    // --- Review-Fix Rest: gesamtpruefung ---
    try{
      // Befunde der Gesamtprüfung nach dem Zusammenführen der Gruppen (Duplizieren, Kopie einer Insel).
      const T=(n,f)=>{ try{ chk(n, !!f()); }catch(err){ chk(n+' ('+err.message+')', false); } };
      const rc=(w,h,open)=>{ const Rr={pts:[{id:'A',x:0,y:0},{id:'B',x:w,y:0},{id:'C',x:w,y:h},{id:'D',x:0,y:h}], walls:[['A','B'],['B','C'],['C','D'],['D','A']]};
        return KX.makeEnv(Rr.pts,Rr.walls,open||[],[]); };
      const bads=(E,K)=>KX.check(E,K,KX.layout(E,K)).filter(f=>f.lvl==='bad').map(f=>f.txt);
      const corner=(ctype,over)=>({id:1,kind:'base',corner:true,ctype,front:'door',cEnd:0,a:'A',b:'B',x:0,w:900,...over});
      T('kueche-gesamt: Duplizieren – der frühere Weg (freie Stelle neben dem Original) stellt einen Eckschrank über Eck mitten an die Wand und ist rot',
        ()=>{ const E=rc(5000,3500), K=KX.normKitchen({items:[corner('L')]}), Wf=KX.wallFrame(E,'A','B');
          const x=KX.freeSlot(E,K,KX.layout(E,K),{...K.items[0],id:2},Wf,900), K2=KX.normKitchen({items:[K.items[0],{...K.items[0],id:2,x}]});
          return x===900 && bads(E,K2).some(s=>/muss bündig in einer rechtwinkligen Innenecke stehen/.test(s)); });
      T('kueche-gesamt: Duplizieren – Eckschrank über Eck / diagonal kommt in die andere Ecke der Wand und steht ohne Befund (Unter- und Hängeeckschrank)',
        ()=>[['base','L'],['base','diag'],['wall','L'],['wall','diag']].every(([kind,ctype])=>{
          const E=rc(5000,3500), K=KX.normKitchen({items:[corner(ctype,{kind})]});
          const n=KX.dupOnWall(E,K,KX.layout(E,K),K.items[0],2);
          if(!n || n.id!==2 || n.a!=='A' || n.b!=='B' || n.cEnd!==1 || n.ctype!==ctype || n.kind!==kind || !near(n.x,4100,0.5)) return false;
          return bads(E,KX.normKitchen({items:[K.items[0],n]})).length===0; }));
      T('kueche-gesamt: Duplizieren – steht der Eckschrank in der Ecke B, geht die Kopie in die Ecke A (gleiche Regel, andere Richtung)',
        ()=>{ const E=rc(5000,3500), K=KX.normKitchen({items:[corner('L',{cEnd:1,x:4100})]});
          const n=KX.dupOnWall(E,K,KX.layout(E,K),K.items[0],2);
          return !!n && n.cEnd===0 && near(n.x,0,0.5) && bads(E,KX.normKitchen({items:[K.items[0],n]})).length===0; });
      T('kueche-gesamt: Duplizieren – beide Ecken der Wand belegt: kein Platz (null) statt einer roten Kopie',
        ()=>{ const E=rc(5000,3500), K=KX.normKitchen({items:[corner('L'),corner('L',{id:3,cEnd:1,x:4100})]});
          return KX.dupOnWall(E,K,KX.layout(E,K),K.items[0],4)===null; });
      T('kueche-gesamt: Duplizieren – normaler Schrank landet bündig neben dem Original (Front und Maße bleiben), tiefe Kopie',
        ()=>{ const E=rc(5000,3500), K=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:1000,w:600,front:'drawer'}]});
          const n=KX.dupOnWall(E,K,KX.layout(E,K),K.items[0],2);
          return !!n && n.id===2 && n.a==='A' && n.b==='B' && near(n.x,1600,0.5) && n.w===600 && n.front==='drawer' && n!==K.items[0] && !('cEnd' in n); });
      T('kueche-gesamt: Duplizieren – am Wandende geht die Kopie auf die andere Seite des Originals, wie bisher die nächste freie Stelle',
        ()=>{ const E=rc(5000,3500), K=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:4400,w:600}]});
          const n=KX.dupOnWall(E,K,KX.layout(E,K),K.items[0],2); return !!n && near(n.x,3800,0.5); });
      // copySpot: Kopie einer Insel nicht in die Türzone (check meldet dort „steht vor einer Tür“)
      const door={id:'o1',kind:'door',a:'A',b:'B',x:2400,w:900,y:0,h:2000,swing:{type:'turn',hinge:'left',out:false}};
      const isl=()=>KX.normKitchen({items:[{id:1,kind:'island',x:1500,y:700,rot:0,w:1200,d:900}]});
      T('kueche-gesamt: Kopie einer Insel ohne Tür in der Nähe – rechts daneben mit 200 mm Luft, wie bisher',
        ()=>{ const E=rc(5000,3500), K=isl(), s=KX.copySpot(E,K,KX.layout(E,K),{...K.items[0],id:2}); return !!s && near(s.x,2900,0.5) && near(s.y,700,0.5); });
      T('kueche-gesamt: Kopie einer Insel (copySpot) steht nicht in der Türzone – die nächste freie Lage quer dahinter, kein Befund zur Tür',
        ()=>{ const E=rc(5000,3500,[door]), K=isl(), s=KX.copySpot(E,K,KX.layout(E,K),{...K.items[0],id:2});
          if(!s) return false;
          const K2=KX.normKitchen({items:[K.items[0],{...K.items[0],id:2,x:s.x,y:s.y}]}), F2=KX.check(E,K2,KX.layout(E,K2)).map(f=>f.txt);
          // der frühere Weg (rechts daneben, 2900/700) stand in der Türzone: „steht vor einer Tür“, Zimmertür schlägt an
          const K3=KX.normKitchen({items:[K.items[0],{...K.items[0],id:2,x:2900,y:700}]}), F3=KX.check(E,K3,KX.layout(E,K3)).map(f=>f.txt);
          return near(s.x,1500,0.5) && near(s.y,1800,0.5) && !F2.some(x=>/steht vor einer Tür|Zimmertür schlägt an/.test(x)) && F3.some(x=>/steht vor einer Tür/.test(x)); });
      T('kueche-gesamt: Kopie einer Insel – bleibt nur die Lage in der Türzone übrig (alle anderen außerhalb des Raums), gibt es keine (null), ohne Tür gibt es sie',
        ()=>{ const E=rc(5000,2000,[door]), E0=rc(5000,2000), K=isl(), c={...K.items[0],id:2};
          return KX.copySpot(E,K,KX.layout(E,K),c)===null && near((KX.copySpot(E0,K,KX.layout(E0,K),c)||{}).x,2900,0.5); });
      // Inselabstand (freeDims) und Gang (check) messen bis zur selben Kante: der Plattenkante der Zeile
      const fz=(y)=>{ const E=rc(5000,3500), K=KX.normKitchen({items:[{id:1,kind:'base',a:'A',b:'B',x:1000,w:1200},{id:2,kind:'island',x:1600,y,rot:0,w:1200,d:900}]});
        const L=KX.layout(E,K), side=KX.freeDims(E,L,L.byId.get(2)).find(d=>!d.wall && d.n.y<-0.5);
        return {E,K,L,side,gang:KX.check(E,K,L).map(f=>f.txt).filter(s=>/Gang vor Unterschrank|Vor Unterschrank/.test(s))}; };
      T('kueche-gesamt: Inselabstand zur Zeile – das Maß geht bis zur Plattenkante (1200), nicht bis zum Korpus (1220), und der Gang ist dann auch 1200: keine Meldung',
        ()=>{ const r=fz(2250); return !!r.side && near(r.side.val,1200,0.6) && r.gang.length===0; });
      T('kueche-gesamt: Inselabstand – das Maß eingetragen (applyDim) trifft den Gang: 1180 gelb „1180 mm“, 1200 ohne Meldung',
        ()=>{ const r=fz(2250);
          const gang=(v)=>{ const K2=KX.normKitchen(JSON.parse(JSON.stringify(r.K))); const e=KX.freeDims(r.E,KX.layout(r.E,K2),KX.layout(r.E,K2).byId.get(2)).find(d=>!d.wall && d.n.y<-0.5).edit;
            if(!KX.applyDim(r.E,K2,e,v)) return null; return KX.check(r.E,K2,KX.layout(r.E,K2)).map(f=>f.txt).filter(s=>/Gang vor Unterschrank|Vor Unterschrank/.test(s)); };
          const a=gang(1180), b=gang(1200); return !!a && a.some(s=>/Gang vor Unterschrank 120 1180 mm/.test(s)) && !!b && b.length===0; });
      // Öffnung ohne gültige Lage (Fremdimport, Link, Handbearbeitung): die Küche übergeht sie, statt bei jedem Neuzeichnen zu werfen
      T('kueche-gesamt: Öffnung mit Text oder fehlender Lage/Breite wirft in Wegen, Vorschlag und Einräumen nicht, die gültige Tür bleibt',
        ()=>{ const good={id:'o1',kind:'door',a:'A',b:'B',x:1500,w:900,y:0,h:2000,swing:{type:'turn',hinge:'left',out:false}};
          const items=[{id:1,kind:'base',dev:'sink',a:'A',b:'B',x:0,w:600},{id:2,kind:'base',dev:'hob',a:'A',b:'B',x:600,w:600},{id:3,kind:'fridge',a:'C',b:'D',x:200,w:600}];
          return [{w:undefined},{w:'x'},{w:{}},{x:'x'},{x:{}},{x:undefined}].every(bad=>{
            const E=rc(5000,3500,[good,{...good,id:'o2',...bad}]), K=KX.normKitchen({items}), L=KX.layout(E,K);
            KX.check(E,K,L); KX.flows(E,K,L,{}); KX.suggest(E,K,L); KX.optimalStore(E,K,L);
            return E.openings.length===1 && E.openings[0].id==='o1'; }); });
      // Maßkette an einer absurd langen Wand (korrupte Datei): blockReach halbiert höchstens 64-mal, statt bei b-a>0,02 zu hängen
      T('kueche-gesamt: Maßkette an einer Wand von 1e15 mm Länge kehrt zurück (die Bisektion in blockReach ist gedeckelt)',
        ()=>{ const pts=[{id:'A',x:0,y:0},{id:'B',x:4000,y:0},{id:'C',x:4000,y:1e15},{id:'D',x:0,y:3000}], wl=[['A','B'],['B','C'],['C','D'],['D','A']];
          const E=KX.makeEnv(pts,wl,[],[]), K=KX.normKitchen({items:[{id:1,kind:'base',a:'B',b:'C',x:306,w:600,front:'door'}]}), L=KX.layout(E,K);
          const D=KX.chainDims(E,L,L.G[0],K); return !!D && Array.isArray(D.segs) && D.segs.length>0; });
      // Duplizieren in eine schiefe Ecke: kein zweiter Schenkel, die Kopie wäre rot - also kein Platz
      T('kueche-gesamt: Duplizieren – die andere Ecke der Wand ist schief (kein zweiter Schenkel): kein Platz (null) statt einer roten Kopie',
        ()=>{ const E=KX.makeEnv([{id:'A',x:0,y:0},{id:'B',x:5000,y:0},{id:'C',x:4700,y:3500},{id:'D',x:0,y:3500}],[['A','B'],['B','C'],['C','D'],['D','A']],[],[]);
          const K=KX.normKitchen({items:[corner('L')]});
          return KX.dupOnWall(E,K,KX.layout(E,K),K.items[0],2)===null && bads(E,K).length===0; });
      // Inselabstand: dringt die Kante in die Platte der Zeile ein, ist der Abstand 0 (check: „nur 0 mm“), nicht der Korpusabstand
      T('kueche-gesamt: Inselabstand – die Kante dringt in die Platte der Zeile ein: 0 statt des Korpusabstands 40; frei davor wie bisher',
        ()=>{ const E=rc(5000,3500), mk=y=>{ const K=KX.normKitchen({spec:{topD:650},items:[{id:1,kind:'base',a:'A',b:'B',x:1000,w:1200},{id:2,kind:'island',x:1600,y,rot:0,w:1200,d:900}]});
            const L=KX.layout(E,K); return {F:KX.check(E,K,L).map(f=>f.txt), d:KX.freeDims(E,L,L.byId.get(2)).find(x=>!x.wall && x.n.y<-0.5)}; };
          const a=mk(1070), b=mk(1300); return !!a.d && a.d.val===0 && a.F.some(s=>/Vor Unterschrank 120 nur 0 mm Platz/.test(s)) && !!b.d && near(b.d.val,200,0.5); });
      // Maßkette, Zeile ohne Hängeschränke: ein Nachbar, der den Eckschrank um 0,6 mm überlappt, bekommt kein Scheinfeld (der Block
      // mit dem zweiten Schenkel bleibt gesperrt); nur die Hängezeile beginnt ihre Blöcke an der Lücke
      T('kueche-gesamt: Maßkette – Nachbar mit 0,6 mm Überlappung am Eckschrank über Eck: kein Wandabstand-Feld, das den Nachbarn aus dem Block löst',
        ()=>{ const E=rc(5000,3500), K=KX.normKitchen({items:[corner('L'),{id:2,kind:'base',a:'A',b:'B',x:899.4,w:600}]}), L=KX.layout(E,K);
          const D=KX.chainDims(E,L,L.byId.get(2),K); return !!D && bads(E,K).length===0 && !D.segs.some(s=>s.edit && s.edit.ids.includes(2)); });
    }catch(err){ chk('kueche: Review-Fix Rest: gesamtpruefung ohne Ausnahme ('+err.message+')', false); }
  }
  return {ok, out};
};
// Im Browser: raumaufmass.html?test ruft die Checks auf und schreibt sie in die
// Konsole. Auf der Kommandozeile macht das test/run.mjs.
if(typeof location!=='undefined' && location.search.includes('test')){
  const r=globalThis.selfChecks();
  console[r.ok?'log':'error']('Selbstchecks\n'+r.out.join('\n'));
}
