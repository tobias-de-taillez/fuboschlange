// ------------------------------------------------ ELSED: Liniensegmente im Bild
// Herkunft: ELSED - Enhanced Line SEgment Drawing, I. Suarez, J. M. Buenaposada,
// L. Baumela, Pattern Recognition 127 (2022) 108619, doi:10.1016/j.patcog.2022.108619.
// Quelle: https://github.com/iago-suarez/ELSED, Commit 1878213b2f5f06a9261d8b1838f53d48e5fd128d
// (src/ELSED.cpp, EdgeDrawer.cpp, FullSegmentInfo.cpp, Utils.h, ELSED.h).
// Lizenz: Apache License 2.0 (Text: LICENSE im Original-Repo). Das Repo traegt keine
// Copyright-Zeile (LICENSE ist der unausgefuellte Vordruck, keine NOTICE-Datei); Urheber:
// Iago Suarez, Jose M. Buenaposada, Luis Baumela. Glaettung und Gausskern folgen OpenCV 4.x
// (modules/imgproc/src/smooth.dispatch.cpp, smooth.simd.hpp; Apache-2.0).
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//       http://www.apache.org/licenses/LICENSE-2.0
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.
//
// Nach JavaScript portiert, geaendert (Apache-2.0, Abschnitt 4b):
//   - C++ -> JavaScript, ohne OpenCV: cv::GaussianBlur (CV_8U, bit-exakter Festkommapfad
//     von OpenCV 4.x, Rand REFLECT_101) und cv::Sobel (3x3, CV_16S, Rand REPLICATE) nachgebaut;
//   - float-Rechnung des Originals mit Math.fround nachgebildet, int64-Summen exakt;
//   - Klassen aufgeloest: EdgeDrawer/FullSegmentInfo als Zustand im Abschluss, Pixel/Segmente
//     in Typed Arrays, Puffer bleiben zwischen Aufrufen gleicher Groesse erhalten;
//   - Eingabe Float32Array wird wie convertTo(CV_8U) gerundet (halb-gerade, 0..255);
//   - scanIntervals < 1 wirft (Original: Endlosschleife); Farbbilder nicht unterstuetzt;
//   - Zusatzoptionen o.zeiten / o.debug (nur Messung/Test, aendern nichts am Ergebnis).
// Bezeichner der portierten Teile wie im Original, damit der Port Zeile fuer Zeile mit
// dem C++-Code vergleichbar bleibt.
//
// G.elsed(g, W, H, o) -> [{x1,y1,x2,y2,salience}, ...]
//   g: Graustufen 0..255, Zeile fuer Zeile, Laenge W*H (Uint8Array oder Float32Array).
//   Endpunkte in Pixelkoordinaten (Pixelmitte = ganze Zahl), float32-Werte wie im Original.
//   salience wie SalientSegment: mit validate = Zahl der Pixel, deren Gradientenrichtung zur
//   Geraden passt; ohne validate = Segmentlaenge.
//   o (ELSEDParams, gleiche Namen und Vorgaben):
//     ksize 5               Groesse des Gausskerns (<= 2: keine Glaettung)
//     sigma 1               Sigma des Gausskerns
//     gradientThreshold 30  Pixel mit |dx|+|dy| darunter sind keine Kantenkandidaten
//     anchorThreshold 8     Anker: Gradient um so viel groesser als beide Nachbarn quer zur Kante
//     scanIntervals 2       Ankersuche in jeder n-ten Zeile/Spalte
//     minLineLen 15         Mindestlaenge eines Segments (Pixel)
//     lineFitErrThreshold 0.2  mittlerer quadratischer Abstand zur Geraden fuer den Segmentstart
//     pxToSegmentDistTh 1.5    Abstand, bis zu dem ein neues Pixel zum Segment gehoert
//     junctionEigenvalsTh 10   Kreuzungssprung: erster Eigenwert der Gradienten-Autokorrelation
//                              mindestens so viel mal groesser als der zweite
//     junctionAngleTh 10 Grad  (im Bogenmass) Winkel zwischen Segmentnormale und Gradient im Sprung
//     validationTh 0.15        Pruefung: erlaubter Winkelfehler des Gradienten (rad)
//     validate true            Segmente pruefen
//     treatJunctions true      ueber Kreuzungen springen
//     listJunctionSizes [5,7,9]  getestete Sprungweiten (Pixel)
//     zeiten {}   wird mit Millisekunden je Abschnitt gefuellt (glaetten, gradient, anker,
//                 zeichnen, pruefen)
//     debug {}    erhaelt Kopien der Zwischenbilder (blur, dx, dy), Kern, Ankerzahl
// Die Parameter des Originals sind fuer 640x480 abgestimmt; groessere Bilder liefern mehr,
// kuerzere Segmente.
G.elsed=(()=>{
  const fr=Math.fround, PI=Math.PI, PI_2=Math.PI/2, T26=67108864;
  // Utils.h
  const UPM_EDGE_VERTICAL=0, UPM_EDGE_HORIZONTAL=255;
  const UPM_ED_NO_EDGE_PIXEL=0, UPM_ED_EDGE_PIXEL=255, UPM_ED_ANCHOR_PIXEL=204,
        UPM_ED_SEGMENT_INLIER_PX=153, UPM_ED_SEGMENT_OUTLIER_PX=102, UPM_ED_JUNTION_PX=152;
  const UPM_LEFT=1, UPM_RIGHT=2, UPM_UP=3, UPM_DOWN=4, UPM_SKIP_EDGE_PT=2, UPM_MAX_OUTLIERS_TH=3;

  // Bildpuffer (wiederverwendet, solange W*H gleich bleibt)
  let nBuf=-1, img8, hBuf, vAcc, P, dxImg, dyImg, gImg, dirImg, edgeImg, anchors;
  let Pb, hB, dxB, dyB, gB, dirB;   // dieselben Puffer, als lokale Konstanten in den Bildschleifen
  let W=0, H=0;
  // Parameter des laufenden Aufrufs (EdgeDrawer-Felder)
  let lineFitThreshold, pxToSegmentDistTh, minLineLength, treatJunctions, listOfJunctionSizes,
      junctionEigenvalsTh, junctionAngleTh;

  // EdgeDrawer::pixels - eine Kette fuer alle Segmente
  let PX=new Int32Array(1<<14), PY=new Int32Array(1<<14), nP=0;
  const pushPx=(x,y)=>{
    if(nP===PX.length){ const a=new Int32Array(nP*2), b=new Int32Array(nP*2); a.set(PX); b.set(PY); PX=a; PY=b; }
    PX[nP]=x; PY[nP++]=y;
  };
  // EdgeDrawer::segments (fertige): je 8 int (firstPxIndex, lastPxIndex, N, firstPx, lastPx,
  // isHorizontal) und 4 float (endpoints)
  let SI=new Int32Array(8*512), SE=new Float32Array(4*512), nS=0;

  // ---------------------------------------- FullSegmentInfo (das eine Arbeitssegment)
  let sX=0, sY=0, sXY=0, sXX=0, sN=0, sDx=0, sDy=0, sHor=false, e0=0, e1=0, e2=0;
  let sFx=0, sFy=0, sPFx=0, sPFy=0, sLx=0, sLy=0, sPLx=0, sPLy=0, sFi=-1, sLi=-1;
  let sSorted=true, sExt1=false, sExt2=false;   // arePixelsSorted, first/secondEndpointExtended
  // segments.emplace_back(pixels): nur die Felder mit Vorgabewert werden gesetzt
  const segNew=()=>{ sX=0; sY=0; sXY=0; sXX=0; sN=0; sFi=-1; sLi=-1; sSorted=true; sExt1=false; sExt2=false; };
  const calculateLineEq=()=>{
    // c = sum_y*sum_x2 - sum_x*sum_xy ist im Original int64. Die Produkte bleiben bei 861x1920
    // unter ~4e15 (gemessen < 1e15), uebersteigen 2^53 aber ab etwa 1080x2400 bei bildhohen
    // Kanten. Zerlegt in 26-Bit-Haelften sind alle Teilprodukte exakt, gerundet wird einmal
    // am Schluss wie (double)int64.
    const h1=Math.floor(sXX/T26), h2=Math.floor(sXY/T26);
    let c=(sY*h1-sX*h2)*T26+(sY*(sXX-h1*T26)-sX*(sXY-h2*T26)), a, b;
    if(sHor){ a=sN*sXY-sX*sY; b=sX*sX-sN*sXX; }
    else { b=sN*sXY-sX*sY; a=sX*sX-sN*sXX; }
    const f=1/Math.sqrt(a*a+b*b);
    a*=f; b*=f; c*=f;
    if(sDx*-b+sDy*a<0){ a=-a; b=-b; c=-c; }
    e0=a; e1=b; e2=c;
  };
  // Summen ohne Gleichung; jede oeffentliche Methode endet wie im Original mit calculateLineEq
  const addToModel=(x,y)=>{ const i=sHor?x:y, d=sHor?y:x; sN++; sX+=i; sY+=d; sXX+=i*i; sXY+=i*d; };
  const subtractPointFromModel=(x,y)=>{ const i=sHor?x:y, d=sHor?y:x; sN--; sX-=i; sY-=d; sXX-=i*i; sXY-=i*d; };
  const leastSquareLineFit=st=>{
    let a=0, b=0, c=0, d=0;
    if(sHor) for(let i=st;i<nP;i++){ const x=PX[i], y=PY[i]; a+=x; b+=y; c+=x*x; d+=x*y; }
    else for(let i=st;i<nP;i++){ const x=PY[i], y=PX[i]; a+=x; b+=y; c+=x*x; d+=x*y; }
    sX=a; sY=b; sXX=c; sXY=d; sN=nP-st;
    calculateLineEq();
  };
  const segInit=st=>{
    sDx=PX[nP-1]-PX[st]; sDy=PY[nP-1]-PY[st]; sHor=Math.abs(sDx)>=Math.abs(sDy);
    leastSquareLineFit(st);
    sFx=PX[st]; sFy=PY[st]; sLx=PX[nP-1]; sLy=PY[nP-1];
    sPFx=PX[st+1]; sPFy=PY[st+1]; sPLx=PX[nP-2]; sPLy=PY[nP-2];
    sFi=st; sLi=nP-1; sSorted=true; sExt1=false; sExt2=false;
  };
  const skipPositions=()=>{
    subtractPointFromModel(sFx, sFy); subtractPointFromModel(sPFx, sPFy);
    sFi+=UPM_SKIP_EDGE_PT; sLi+=UPM_SKIP_EDGE_PT;
    sFx=PX[sFi]; sFy=PY[sFi]; sLx=PX[nP-1]; sLy=PY[nP-1];
    sPFx=PX[sFi+1]; sPFy=PY[sFi+1]; sPLx=PX[sLi-1]; sPLy=PY[sLi-1];
    sDx=sLx-sFx; sDy=sLy-sFy;
    const t=Math.abs(sDx)>=Math.abs(sDy);
    if(t!==sHor){ sHor=t; leastSquareLineFit(sFi); }
    else { addToModel(sPLx, sPLy); addToModel(sLx, sLy); calculateLineEq(); }
  };
  const addPixel=(x,y,idx,atEnd)=>{
    addToModel(x, y); calculateLineEq();
    if(atEnd){ sPLx=sLx; sPLy=sLy; sLx=x; sLy=y; } else { sPFx=sFx; sPFy=sFy; sFx=x; sFy=y; }
    sLi=idx; sSorted=sSorted && atEnd;
  };
  const removeLastPx=fromEnd=>{
    if(fromEnd) subtractPointFromModel(sLx, sLy); else subtractPointFromModel(sFx, sFy);
    calculateLineEq();
    if(fromEnd){ sLx=sPLx; sLy=sPLy; sPLx=-1; sPLy=-1; } else { sFx=sPFx; sFy=sPFy; sPFx=-1; sPFy=-1; }
    sLi--;
  };
  const getFitError=()=>{ let s=0; for(let i=sFi;i<=sLi;i++){ const d=e0*PX[i]+e1*PY[i]+e2; s+=d*d; } return s/sN; };
  const isInlier=(x,y,th)=>{ const d=e0*x+e1*y+e2; return (d>=0 ? d : -d)<th; };
  // finish(): calcSegmentEndpoints (float), dann in die Tabelle
  const finishSegment=()=>{
    if(nS*8===SI.length){ const a=new Int32Array(SI.length*2), b=new Float32Array(SE.length*2); a.set(SI); b.set(SE); SI=a; SE=b; }
    const a1=fr(e1*e1), a2=fr(e0*e0), a3=fr(e0*e1), a4=fr(e2*e0), a5=fr(e2*e1), k=nS*4, j=nS*8;
    SE[k]=fr(fr(fr(a1*sFx)-fr(a3*sFy))-a4); SE[k+1]=fr(fr(fr(a2*sFy)-fr(a3*sFx))-a5);
    SE[k+2]=fr(fr(fr(a1*sLx)-fr(a3*sLy))-a4); SE[k+3]=fr(fr(fr(a2*sLy)-fr(a3*sLx))-a5);
    SI[j]=sFi; SI[j+1]=sLi; SI[j+2]=sN; SI[j+3]=sFx; SI[j+4]=sFy; SI[j+5]=sLx; SI[j+6]=sLy; SI[j+7]=sHor ? 1 : 0;
    nS++;
  };

  // ---------------------------------------- EdgeDrawer
  // Zeichenstapel (DrawingBranch): Richtung, Pixel, addPixelsForTheFirstSide, Pixelliste (je BK)
  let BK=16, BD=new Int32Array(64), BX=new Int32Array(64), BY=new Int32Array(64), BF=new Uint8Array(64),
      BN=new Int32Array(64), BPX=new Int32Array(64*BK), BPY=new Int32Array(64*BK), nB=0;
  const setBK=k=>{ if(k!==BK){ BK=k; BPX=new Int32Array(BD.length*BK); BPY=new Int32Array(BD.length*BK); } };
  const pushBranch=(d,x,y,f)=>{
    if(nB===BD.length){
      const n=nB*2, g=(A,T)=>{ const a=new T(A.length*2); a.set(A); return a; };
      BD=g(BD,Int32Array); BX=g(BX,Int32Array); BY=g(BY,Int32Array); BF=g(BF,Uint8Array); BN=g(BN,Int32Array);
      BPX=g(BPX,Int32Array); BPY=g(BPY,Int32Array); if(BD.length!==n) throw new Error('ELSED: Stapel');
    }
    BD[nB]=d; BX[nB]=x; BY[nB]=y; BF[nB]=f ? 1 : 0; BN[nB]=0;
    return nB++;
  };
  const OLX=new Int32Array(8), OLY=new Int32Array(8);           // outliersList (hoechstens 5)
  let nOL=0, INX=new Int32Array(16), INY=new Int32Array(16), nIn=0;  // initialPixels
  let EXX=new Int32Array(64), EXY=new Int32Array(64), nEx=0;       // extensionPixels
  let VAX=new Int32Array(64), VAY=new Int32Array(64), nVa=0;       // pixelsToValidate
  const pushEx=(x,y)=>{
    if(nEx===EXX.length){ const a=new Int32Array(nEx*2), b=new Int32Array(nEx*2); a.set(EXX); b.set(EXY); EXX=a; EXY=b; }
    EXX[nEx]=x; EXY[nEx++]=y;
  };
  const pushVa=(x,y)=>{
    if(nVa===VAX.length){ const a=new Int32Array(nVa*2), b=new Int32Array(nVa*2); a.set(VAX); b.set(VAY); VAX=a; VAY=b; }
    VAX[nVa]=x; VAY[nVa++]=y;
  };

  // Laufendes Pixel (px) und Vorgaenger (lastPx) von findNextPxWithGradient. drawEdgeTreeStack
  // und canSegmentBeExtended teilen sie; nach canSegmentBeExtended liest der Aufrufer px/lastPx
  // erst wieder, nachdem er sie neu gesetzt hat (wie die getrennten Locals im Original).
  let cx=0, cy=0, clx=0, cly=0;
  const findNextPxWithGradient=pxGradDirection=>{
    const lastX=clx, lastY=cly; clx=cx; cly=cy;
    let i=cy*W+cx;
    if(pxGradDirection===UPM_EDGE_HORIZONTAL){
      if(lastX<cx){
        if(cx===W-1 || cy===0 || cy===H-1) return false;
        i++; cx++;
        const g1=gImg[i-W], g2=gImg[i], g3=gImg[i+W];
        if(g1>g2 && g1>g3) cy--; else if(g3>g2 && g3>g1) cy++;
      } else if(lastX>cx){
        if(cx===0 || cy===0 || cy===H-1) return false;
        i--; cx--;
        const g1=gImg[i-W], g2=gImg[i], g3=gImg[i+W];
        if(g1>g2 && g1>g3) cy--; else if(g3>g2 && g3>g1) cy++;
      } else if(lastY<cy){
        if(cy===H-1 || cx===0 || cx===W-1) return false;
        i+=W; cy++;
        if(gImg[i-1]>gImg[i+1]) cx--; else cx++;
      } else {
        if(cy===0 || cx===0 || cx===W-1) return false;
        i-=W; cy--;
        if(gImg[i-1]>gImg[i+1]) cx--; else cx++;
      }
    } else {
      if(lastY<cy){
        if(cy===H-1 || cx===0 || cx===W-1) return false;
        i+=W; cy++;
        const g1=gImg[i+1], g2=gImg[i], g3=gImg[i-1];
        if(g1>g2 && g1>g3) cx++; else if(g3>g2 && g3>g1) cx--;
      } else if(lastY>cy){
        if(cy===0 || cx===0 || cx===W-1) return false;
        i-=W; cy--;
        const g1=gImg[i+1], g2=gImg[i], g3=gImg[i-1];
        if(g1>g2 && g1>g3) cx++; else if(g3>g2 && g3>g1) cx--;
      } else if(lastX<cx){
        if(cx===W-1 || cy===0 || cy===H-1) return false;
        i++; cx++;
        if(gImg[i-W]>gImg[i+W]) cy--; else cy++;
      } else {
        if(cx===0 || cy===0 || cy===H-1) return false;
        i--; cx--;
        if(gImg[i-W]>gImg[i+W]) cy--; else cy++;
      }
    }
    return gImg[cy*W+cx]!==0;
  };
  // eq als cv::Vec3f (q0..q2), getProjectionPtn und Rechnung in float
  const findNextPxWithProjection=(q0,q1,q2,invertLineDir,stepSize)=>{
    const X=cx, Y=cy;
    let rx, ry, s=0;
    s=fr(s+fr(q0*X)); s=fr(s+fr(q1*Y)); s=fr(s+q2);
    if(s===0){ rx=X; ry=Y; }
    else {
      const r0=q1, r1=-q0, r2=fr(fr(q0*Y)-fr(q1*X));
      const p0=fr(fr(q1*r2)-fr(q2*r1)), p1=fr(fr(q2*r0)-fr(q0*r2)), p2=fr(fr(q0*r1)-fr(q1*r0));
      rx=fr(p0/p2); ry=fr(p1/p2);
    }
    let ex, ey;
    if(!invertLineDir){ ex=fr(rx-fr(stepSize*q1)); ey=fr(ry+fr(stepSize*q0)); }
    else { ex=fr(rx+fr(stepSize*q1)); ey=fr(ry-fr(stepSize*q0)); }
    if(ex<0 || ex>=W || ey<0 || ey>=H) return false;
    const x=Math.trunc(ex), y=Math.trunc(ey), xa=Math.min(x+1, W-1), ya=Math.min(y+1, H-1);
    const g1=gImg[y*W+x], g2=gImg[y*W+xa], g3=gImg[ya*W+x], g4=gImg[ya*W+xa];
    let gv;
    if(g2>g1){
      if(g3>g2){
        if(g4>g3){ cx=Math.min(x+1, W); cy=Math.min(y+1, H); gv=g4; }
        else { cx=x; cy=Math.min(y+1, H); gv=g3; }
      } else {
        if(g4>g2){ cx=Math.min(x+1, W); cy=Math.min(y+1, H); gv=g4; }
        else { cx=Math.min(x+1, W); cy=y; gv=g2; }
      }
    } else {
      if(g3>g1){
        if(g4>g3){ cx=Math.min(x+1, W); cy=Math.min(y+1, H); gv=g4; }
        else { cx=x; cy=Math.min(y+1, H); gv=g3; }
      } else {
        if(g4>g1){ cx=Math.min(x+1, W); cy=Math.min(y+1, H); gv=g4; }
        else { cx=x; cy=y; gv=g1; }
      }
    }
    return gv!==0;
  };
  const bresenham=(x0,y0,x1,y1)=>{
    nEx=0;
    let dx=x1-x0, dy=y1-y0, x=x0, y=y0;
    const xi=dx<0 ? -1 : 1, yi=dy<0 ? -1 : 1;
    dx=Math.abs(dx); dy=Math.abs(dy);
    if(dx>=dy){
      let p=2*dy-dx;
      while(x!==x1){ pushEx(x, y); if(p>=0){ y+=yi; p+=2*dy-2*dx; } else p+=2*dy; x+=xi; }
    } else {
      let p=2*dx-dy;
      while(y!==y1){ pushEx(x, y); if(p>=0){ x+=xi; p+=2*dx-2*dy; } else p+=2*dx; y+=yi; }
    }
    pushEx(x1, y1);
  };
  const circularDist=(A,B,mod)=>{
    let a, b; if(A<B){ a=A; b=B; } else { a=B; b=A; }
    const d1=b-a, d2=a+(mod-b);
    return d2<d1 ? d2 : d1;
  };
  const canSegmentBeExtended=extendByTheEnd=>{
    const fx=extendByTheEnd ? sLx : sFx, fy=extendByTheEnd ? sLy : sFy;
    const q0=fr(e0), q1=fr(e1), q2=fr(e2);   // Vec3d -> Vec3f
    nVa=0;                                     // pixelsToValidate sammelt ueber alle Groessen
    for(let jj=0;jj<listOfJunctionSizes.length;jj++){
      const J=listOfJunctionSizes[jj];
      if(sN<=(J>>>0)) break;
      cx=fx; cy=fy;
      if(!findNextPxWithProjection(q0, q1, q2, !extendByTheEnd, J)) continue;
      bresenham(fx, fy, cx, cy);
      clx=EXX[nEx-2]; cly=EXY[nEx-2];
      for(let i=0;i<J;i++){
        if(!findNextPxWithGradient(sHor ? UPM_EDGE_HORIZONTAL : UPM_EDGE_VERTICAL)){ nEx=0; break; }
        if(isInlier(cx, cy, pxToSegmentDistTh)){ pushEx(cx, cy); pushVa(cx, cy); }
        else { nEx=0; break; }
      }
      if(nEx===0) continue;
      let theta=Math.atan2(e0, e1)+PI_2;
      while(theta<0) theta+=PI;
      while(theta>=PI) theta-=PI;
      // Autokorrelation der Gradienten M = [[a, b], [b, d]] in float
      let a=0, b=0, d=0;
      const hv=Math.abs(VAX[nVa-1]-VAX[0])>=Math.abs(VAY[nVa-1]-VAY[0]);
      for(let k=0;k<nVa;k++) for(let off=-1;off<=1;off++){
        const yy=VAY[k]+(hv ? off : 0), xx=VAX[k]+(hv ? 0 : off);
        const ii=Math.min(H-1, Math.max(0, yy))*W+Math.min(W-1, Math.max(0, xx));
        const gx=dxImg[ii], gy=dyImg[ii];
        a=fr(a+gx*gx); b=fr(b+gx*gy); d=fr(d+gy*gy);
      }
      const tmp=fr(fr(a*a)-fr(d*d));
      const s1=fr(fr(fr(a*a)+fr(fr(2*b)*b))+fr(d*d));
      const ad=fr(a+d);
      const s2=fr(Math.sqrt(fr(fr(tmp*tmp)+fr(fr(fr(fr(4*b)*b)*ad)*ad))));
      let eigen_angle=fr(-0.5*fr(Math.atan2(fr(fr(fr(2*a)*b)+fr(fr(2*b)*d)), tmp)));
      while(eigen_angle<0) eigen_angle=fr(eigen_angle+PI);
      while(eigen_angle>=PI) eigen_angle=fr(eigen_angle-PI);
      const fitsEigenvaluesCond=Math.sqrt(fr(s1+s2)/(fr(s1-s2)+0.00001))>junctionEigenvalsTh;
      const fitsAngleCond=circularDist(theta, eigen_angle, PI)<junctionAngleTh;
      if(!fitsEigenvaluesCond || !fitsAngleCond) continue;
      return true;
    }
    return false;
  };
  const inverseDirection=d=>d===UPM_RIGHT ? UPM_LEFT : d===UPM_LEFT ? UPM_RIGHT : d===UPM_UP ? UPM_DOWN : UPM_UP;
  const directionFromLineEq=()=>{
    const lineX=-e1, lineY=e0;
    if((lineX>=0 ? lineX : -lineX)>(lineY>=0 ? lineY : -lineY)) return lineX>0 ? UPM_RIGHT : UPM_LEFT;
    return lineY>0 ? UPM_DOWN : UPM_UP;
  };
  const addJunctionPixelsToSegment=addFirst=>{
    if(addFirst) sExt1=true; else sExt2=true;
    const half=nEx>>>1;
    for(let i=0;i<nEx;i++){
      const x=EXX[i], y=EXY[i];
      if(isInlier(x, y, pxToSegmentDistTh)){
        edgeImg[y*W+x]=i<half ? UPM_ED_JUNTION_PX : UPM_ED_SEGMENT_INLIER_PX;
        pushPx(x, y);
        addPixel(x, y, nP-1, addFirst);
      } else edgeImg[y*W+x]=UPM_ED_SEGMENT_OUTLIER_PX;
    }
  };
  const drawEdgeTreeStack=(ax,ay,firstAnchorDirection)=>{
    let indexInArray=0, segment=false, firstBranch=true;
    const isAnchorFirstPx=PX[nP-1]===ax && PY[nP-1]===ay && firstAnchorDirection;
    segNew();
    while(nB>0){
      let popStack=true;
      const b=nB-1;                                  // branchesStack.back()
      let initialPxIndex=nP;
      if(firstBranch && isAnchorFirstPx) initialPxIndex--;
      const direction=BD[b], addFirst=BF[b]===1;
      cx=BX[b]; cy=BY[b];
      for(let k=0, o=b*BK;k<BN[b];k++) pushPx(BPX[o+k], BPY[o+k]);
      let lastChekedPxIdx=initialPxIndex, inlierOverwritten=false;
      nOL=0;
      switch(direction){                             // calcLastPixelWithDirection
        case UPM_UP: clx=cx; cly=cy+1; break;
        case UPM_DOWN: clx=cx; cly=cy-1; break;
        case UPM_LEFT: clx=cx+1; cly=cy; break;
        case UPM_RIGHT: clx=cx-1; cly=cy; break;
        default: clx=-1; cly=-1;
      }
      let gradDir=(direction===UPM_DOWN || direction===UPM_UP) ? UPM_EDGE_VERTICAL : UPM_EDGE_HORIZONTAL;
      let localSegInitialized=false;
      while(nOL<=UPM_MAX_OUTLIERS_TH){
        if(!findNextPxWithGradient(gradDir)) break;
        indexInArray=cy*W+cx;
        const ev=edgeImg[indexInArray];
        inlierOverwritten=ev===UPM_ED_SEGMENT_INLIER_PX || ev===UPM_ED_JUNTION_PX || ev===UPM_ED_EDGE_PIXEL;
        if(inlierOverwritten) break;
        if(segment){
          if(isInlier(cx, cy, pxToSegmentDistTh)){
            edgeImg[indexInArray]=UPM_ED_SEGMENT_INLIER_PX;
            pushPx(cx, cy);
            nOL=0;
            addPixel(cx, cy, nP-1, addFirst);
            if(addFirst) sExt1=false; else sExt2=false;
          } else {
            OLX[nOL]=cx; OLY[nOL++]=cy;
            edgeImg[indexInArray]=UPM_ED_SEGMENT_OUTLIER_PX;
          }
        } else {
          pushPx(cx, cy);
          edgeImg[indexInArray]=UPM_ED_EDGE_PIXEL;
          if(nP-lastChekedPxIdx>=minLineLength){
            if(localSegInitialized) skipPositions();
            else { localSegInitialized=true; segInit(lastChekedPxIdx); }
            if(getFitError()<lineFitThreshold){
              segment=true;
              for(let i=lastChekedPxIdx;i<lastChekedPxIdx+minLineLength;i++) edgeImg[PY[i]*W+PX[i]]=UPM_ED_SEGMENT_INLIER_PX;
            } else lastChekedPxIdx+=UPM_SKIP_EDGE_PT;
          }
        }
        gradDir=dirImg[indexInArray];
      }
      // Pixel neben dem Anker fuer die Gegenrichtung merken
      if(firstBranch && edgeImg[ay*W+ax]!==UPM_ED_SEGMENT_INLIER_PX){
        nIn=0;
        const nElements=Math.min(nP-initialPxIndex, minLineLength-1);
        for(let i=initialPxIndex+nElements-1;i>=initialPxIndex;i--){
          const ii=PY[i]*W+PX[i];
          if(edgeImg[ii]===UPM_ED_SEGMENT_INLIER_PX || edgeImg[ii]===UPM_ED_JUNTION_PX) break;
          INX[nIn]=PX[i]; INY[nIn++]=PY[i];
        }
      }
      if(segment){
        if(nOL>0 && (addFirst || !sSorted)){        // letztes Pixel entfernen
          const dX=addFirst ? sLx : sFx, dY=addFirst ? sLy : sFy;
          edgeImg[dY*W+dX]=UPM_ED_NO_EDGE_PIXEL;
          removeLastPx(addFirst);
          for(let k=nOL;k>0;k--){ OLX[k]=OLX[k-1]; OLY[k]=OLY[k-1]; }
          OLX[0]=PX[nP-1]; OLY[0]=PY[nP-1]; nOL++; nP--;
          if(!addFirst && sFx===ax && sFy===ay) sExt2=true;
        }
        // BRANCH 3: ohne Segment weiterzeichnen (Eintrag wiederverwenden)
        if(nOL>UPM_MAX_OUTLIERS_TH){
          for(let k=0;k<nOL;k++) edgeImg[OLY[k]*W+OLX[k]]=UPM_ED_NO_EDGE_PIXEL;
          const predictedLastDir=dirImg[indexInArray]===UPM_EDGE_HORIZONTAL ? (clx<cx ? UPM_RIGHT : UPM_LEFT) : (cly<cy ? UPM_DOWN : UPM_UP);
          popStack=false;
          BD[b]=predictedLastDir; BX[b]=cx; BY[b]=cy; BF[b]=1;
          const o=b*BK;
          BPX[o]=PX[nP-1]; BPY[o]=PY[nP-1];
          for(let k=0;k<nOL;k++){ BPX[o+1+k]=OLX[k]; BPY[o+1+k]=OLY[k]; }
          BN[b]=nOL+1;
        }
        // BRANCH 1: geradeaus ueber die Kreuzung
        if((nOL>UPM_MAX_OUTLIERS_TH || inlierOverwritten) && !sExt1 && treatJunctions && canSegmentBeExtended(true)){
          const lineDirection=directionFromLineEq();
          addJunctionPixelsToSegment(addFirst);
          if(popStack){ popStack=false; BD[b]=lineDirection; BX[b]=EXX[nEx-1]; BY[b]=EXY[nEx-1]; BF[b]=1; BN[b]=0; }
          else pushBranch(lineDirection, EXX[nEx-1], EXY[nEx-1], true);
        } else {
          // BRANCH 2: die andere Seite des Segments
          sExt1=true;
          const wasExtended=sExt2;
          if(!wasExtended && sFx===ax && sFy===ay){
            const oppositeLineDirection=inverseDirection(directionFromLineEq());
            sExt2=true;
            if(popStack){ popStack=false; BD[b]=oppositeLineDirection; BX[b]=ax; BY[b]=ay; BF[b]=0; BN[b]=0; }
            else pushBranch(oppositeLineDirection, ax, ay, false);
          } else if(!wasExtended && treatJunctions && canSegmentBeExtended(false)){
            addJunctionPixelsToSegment(false);
            const opositeLineDirection=inverseDirection(directionFromLineEq());
            if(popStack){ popStack=false; BD[b]=opositeLineDirection; BX[b]=EXX[nEx-1]; BY[b]=EXY[nEx-1]; BF[b]=0; BN[b]=0; }
            else pushBranch(opositeLineDirection, EXX[nEx-1], EXY[nEx-1], false);
          } else {
            sExt2=true;
            finishSegment();                         // fertig; neues Arbeitssegment
            segNew();
            segment=false;
          }
        }
      }
      if(popStack) nB--;
      firstBranch=false;
      nEx=0;
    }
  };
  const drawEdgeInBothDirections=(direction,ax,ay)=>{
    edgeImg[ay*W+ax]=UPM_ED_ANCHOR_PIXEL;
    pushBranch(direction, ax, ay, true);
    pushPx(ax, ay);
    nIn=0;
    drawEdgeTreeStack(ax, ay, true);
    const b=pushBranch(inverseDirection(direction), ax, ay, true), o=b*BK;
    for(let k=0;k<nIn;k++){ BPX[o+k]=INX[k]; BPY[o+k]=INY[k]; }
    BN[b]=nIn;
    drawEdgeTreeStack(ax, ay, false);
  };

  // ---------------------------------------- Glaetten und Gradient
  // Gausskern wie OpenCV 4.x fuer CV_8U: getGaussianKernelBitExact, dann
  // getGaussianKernelFixedPoint_ED (8 Nachkommabits, Fehlerdiffusion, cvRound halb-gerade).
  // (OpenCV rechnet mit softdouble; sigma <= 0 ausserhalb der Tabellen nutzt dort ein
  // fusioniertes mulAdd - hier n*0.15+0.35.)
  const rhe=v=>{ const r=Math.round(v); return (r-v===0.5 && (r&1)) ? r-1 : r; };
  const KTAB={1:[1], 3:[.25,.5,.25], 5:[.0625,.25,.375,.25,.0625], 7:[.03125,.109375,.21875,.28125,.21875,.109375,.03125],
    9:[4/256,13/256,30/256,51/256,60/256,51/256,30/256,13/256,4/256]};
  const kCache=new Map();
  const gaussKernel=(n,sigma)=>{
    const key=n+'/'+sigma; let k=kCache.get(key); if(k) return k;
    if(!(n&1) || n<1) throw new Error('ELSED: ksize muss ungerade sein');
    let v;
    if(sigma<=0 && KTAB[n]) v=KTAB[n];
    else {
      const sx=sigma>0 ? sigma : n*0.15+0.35, s2=-0.125/(sx*sx), n2=(n-1)>>1, val=[];
      let sum=0;
      for(let i=0, x=1-n;i<n2;i++, x+=2){ const t=Math.exp(x*x*s2); val.push(t); sum+=t; }
      sum*=2; sum+=1;
      const m=1/sum; v=new Array(n);
      for(let i=0;i<n2;i++) v[i]=v[n-1-i]=val[i]*m;
      v[n2]=m;
    }
    k=new Int32Array(n);
    const h=n>>1; let err=0, s=0;
    for(let i=0;i<h;i++){ const adj=v[i]*256+err, r=rhe(adj); err=adj-r; k[i]=k[n-1-i]=r; s+=r; }
    k[h]=256-2*s;
    kCache.set(key, k);
    return k;
  };
  const reflect101=(p,len)=>{
    if(p>=0 && p<len) return p;
    if(len===1) return 0;
    do { p=p<0 ? -p : 2*len-2-p; } while(p<0 || p>=len);
    return p;
  };
  // src (W*H, 8 Bit) -> Innenbereich von P ((W+2)*(H+2)); Zeilenpass exakt, Spaltenpass
  // 16.16 mit (s + 2^15) >> 16 wie fixedSmoothInvoker<uint8_t, ufixedpoint16>
  // (Kerne sind symmetrisch; der 5er-Kern - Vorgabe - hat einen ausgeschriebenen Innenpfad.)
  const gaussianBlurInto=(src,kx,ky)=>{
    const nx=kx.length, ny=ky.length, rx=nx>>1, ry=ny>>1, W2=W+2, hBuf=hB, P=Pb;
    for(let y=0;y<H;y++){
      const r=y*W;
      let x0=Math.min(rx, W), x1=Math.max(x0, W-rx);
      for(let x=0;x<W;x++){
        if(x===x0 && x<x1){
          if(nx===5){
            const a=kx[0], b=kx[1], c=kx[2];
            for(let q=r+x, e=r+x1;q<e;q++) hBuf[q]=a*(src[q-2]+src[q+2])+b*(src[q-1]+src[q+1])+c*src[q];
          } else for(let q=r+x, e=r+x1;q<e;q++){
            let s=kx[rx]*src[q];
            for(let j=0;j<rx;j++) s+=kx[j]*(src[q-rx+j]+src[q+rx-j]);
            hBuf[q]=s;
          }
          x=x1-1; continue;
        }
        let s=0;
        for(let j=0;j<nx;j++) s+=kx[j]*src[r+reflect101(x-rx+j, W)];
        hBuf[r+x]=s;
      }
    }
    const rowOf=i=>(i>=0 && i<H ? i : reflect101(i, H))*W;
    for(let y=0;y<H;y++){
      const p=(y+1)*W2+1;
      if(ny===5){
        const a=ky[0], b=ky[1], c=ky[2], q0=rowOf(y-2), q1=rowOf(y-1), q2=y*W, q3=rowOf(y+1), q4=rowOf(y+2);
        for(let x=0;x<W;x++) P[p+x]=(a*(hBuf[q0+x]+hBuf[q4+x])+b*(hBuf[q1+x]+hBuf[q3+x])+c*hBuf[q2+x]+32768)>>16;
      } else {
        vAcc.fill(0, 0, W);
        for(let i=0;i<ny;i++){
          const k=ky[i], q=rowOf(y-ry+i);
          for(let x=0;x<W;x++) vAcc[x]+=k*hBuf[q+x];
        }
        for(let x=0;x<W;x++) P[p+x]=(vAcc[x]+32768)>>16;
      }
    }
  };
  // Sobel 3x3 (BORDER_REPLICATE) und computeGradients in einem Durchgang ueber P
  const computeGradients=gradientTh=>{
    const W2=W+2, P=Pb, dxImg=dxB, dyImg=dyB, gImg=gB, dirImg=dirB;   // lokal: schneller in V8
    for(let y=1;y<=H;y++){ P[y*W2]=P[y*W2+1]; P[y*W2+W+1]=P[y*W2+W]; }
    P.copyWithin(0, W2, 2*W2);
    P.copyWithin((H+1)*W2, H*W2, (H+1)*W2);
    for(let y=0;y<H;y++){
      // getrennt gerechnet, Fenster gleitet: je Spalte sv = oben+2*mitte+unten und
      // dv = unten-oben; dx = sv(x+1)-sv(x-1), dy = dv(x-1)+2*dv(x)+dv(x+1) (ganzzahlig exakt)
      const p=y*W2, p1=p+W2, p2=p1+W2;
      let i=y*W, svA=P[p]+2*P[p1]+P[p2], dvA=P[p2]-P[p], svB=P[p+1]+2*P[p1+1]+P[p2+1], dvB=P[p2+1]-P[p+1];
      for(let q=2, e=W+2;q<e;q++, i++){
        const t=P[p+q], u=P[p2+q], svC=t+2*P[p1+q]+u, dvC=u-t;
        const gx=svC-svA, gy=dvA+2*dvB+dvC;
        svA=svB; svB=svC; dvA=dvB; dvB=dvC;
        dxImg[i]=gx; dyImg[i]=gy;
        const ax=gx<0 ? -gx : gx, ay=gy<0 ? -gy : gy, sum=ax+ay;
        gImg[i]=sum<gradientTh ? 0 : sum;
        dirImg[i]=ax>=ay ? UPM_EDGE_VERTICAL : UPM_EDGE_HORIZONTAL;
      }
    }
  };
  const computeAnchorPoints=(scanInterval,anchorThresh)=>{
    let n=0;
    for(let w=1;w<W-1;w+=scanInterval) for(let h=1;h<H-1;h+=scanInterval){
      const i=h*W+w, gv=gImg[i];
      if(gv===0) continue;
      if(dirImg[i]===UPM_EDGE_HORIZONTAL){
        if(gv>=gImg[i-W]+anchorThresh && gv>=gImg[i+W]+anchorThresh) anchors[n++]=i;
      } else if(gv>=gImg[i-1]+anchorThresh && gv>=gImg[i+1]+anchorThresh) anchors[n++]=i;
    }
    return n;
  };
  const blerp=(c00,c10,c01,c11,tx,ty)=>{
    const a=fr(c00+fr(fr(c10-c00)*tx)), b=fr(c01+fr(fr(c11-c01)*tx));
    return fr(a+fr(fr(b-a)*ty));
  };

  // ---------------------------------------- ELSED::processImage + drawAnchorPoints
  return (g,Wi,Hi,o={})=>{
    const now=()=>(typeof performance!=='undefined' ? performance.now() : Date.now());
    const zeiten=o.zeiten, t0=zeiten ? now() : 0;
    W=Wi|0; H=Hi|0;
    if(W<=0 || H<=0) return [];
    const ksize=(o.ksize ?? 5)|0, sigma=fr(o.sigma ?? 1), gradientThreshold=fr(o.gradientThreshold ?? 30);
    const anchorThreshold=(o.anchorThreshold ?? 8)&255, scanIntervals=(o.scanIntervals ?? 2)>>>0;
    const validationTh=o.validationTh ?? 0.15, validate=o.validate ?? true;
    if(scanIntervals<1) throw new Error('ELSED: scanIntervals >= 1');
    minLineLength=(o.minLineLen ?? 15)|0;
    lineFitThreshold=fr(o.lineFitErrThreshold ?? 0.2);    // im EdgeDrawer float
    pxToSegmentDistTh=fr(o.pxToSegmentDistTh ?? 1.5);     // im EdgeDrawer float
    treatJunctions=o.treatJunctions ?? true;
    listOfJunctionSizes=(o.listJunctionSizes ?? [5, 7, 9]).map(v=>v|0);
    junctionEigenvalsTh=o.junctionEigenvalsTh ?? 10;
    junctionAngleTh=o.junctionAngleTh ?? 10*(PI/180);

    const N=W*H;
    if(N!==nBuf){
      nBuf=N;
      img8=new Uint8Array(N); hBuf=new Uint16Array(N); P=new Uint8Array((W+2)*(H+2));
      dxImg=new Int16Array(N); dyImg=new Int16Array(N); gImg=new Int16Array(N); dirImg=new Uint8Array(N); edgeImg=new Uint8Array(N);
      anchors=new Int32Array(Math.max(1, Math.ceil(N/4)));
    }
    if(!vAcc || vAcc.length<W) vAcc=new Int32Array(W);
    if(P.length!==(W+2)*(H+2)) P=new Uint8Array((W+2)*(H+2));
    Pb=P; hB=hBuf; dxB=dxImg; dyB=dyImg; gB=gImg; dirB=dirImg;
    const nAMax=(W>2 ? Math.floor((W-3)/scanIntervals)+1 : 0)*(H>2 ? Math.floor((H-3)/scanIntervals)+1 : 0);
    if(anchors.length<nAMax) anchors=new Int32Array(nAMax);

    // Graustufen 8 Bit (cv::Mat CV_8UC1)
    let src;
    if(g instanceof Uint8Array || g instanceof Uint8ClampedArray) src=g;
    else {
      src=img8;
      for(let i=0;i<N;i++){ const v=g[i]; src[i]=v>=255 ? 255 : v>0 ? rhe(v) : 0; }
    }
    // GaussianBlur(image, blurredImg, Size(ksize, ksize), sigma), Rand REFLECT_101
    let kern=null;
    if(ksize>2){
      const kw=W===1 ? 1 : ksize, kh=H===1 ? 1 : ksize;
      if(kw===1 && kh===1){ for(let y=0;y<H;y++) P.set(src.subarray(y*W, y*W+W), (y+1)*(W+2)+1); }
      else { kern=gaussKernel(kw, sigma); gaussianBlurInto(src, kern, kh===kw ? kern : gaussKernel(kh, sigma)); }
    } else for(let y=0;y<H;y++) P.set(src.subarray(y*W, y*W+W), (y+1)*(W+2)+1);
    const t1=zeiten ? now() : 0;
    computeGradients((Math.trunc(gradientThreshold)<<16)>>16);   // (short) gradientThreshold
    const t2=zeiten ? now() : 0;

    let anchorTh=anchorThreshold, nA=0, anchoThIsZero;
    do {
      anchoThIsZero=anchorTh===0;
      nA=computeAnchorPoints(scanIntervals, anchorTh);
      if(nA===0) anchorTh=anchorTh>>1;
    } while(nA===0 && !anchoThIsZero);
    edgeImg.fill(0);
    const t3=zeiten ? now() : 0;

    nP=0; nS=0; nB=0;
    setBK(Math.max(minLineLength, 8));
    if(INX.length<BK){ INX=new Int32Array(BK); INY=new Int32Array(BK); }
    for(let k=0;k<nA;k++){
      const i=anchors[k];
      if(edgeImg[i]) continue;
      const ax=i%W, ay=(i-ax)/W;
      drawEdgeInBothDirections(dirImg[i]===UPM_EDGE_HORIZONTAL ? UPM_RIGHT : UPM_DOWN, ax, ay);
    }
    const t4=zeiten ? now() : 0;

    // Pruefung: Gradientenrichtung entlang des Segments (UPM_SD_USE_REPROJECTION)
    const out=[];
    for(let s=0;s<nS;s++){
      const j=s*8, k=s*4, fi=SI[j], li=SI[j+1], n=SI[j+2], fx=SI[j+3], fy=SI[j+4], lx=SI[j+5], ly=SI[j+6], hor=SI[j+7]===1;
      const x1=SE[k], y1=SE[k+1], x2=SE[k+2], y2=SE[k+3];
      let valid=true, saliency=0;
      if(validate){
        if(n<2) valid=false;
        else {
          let theta=(x2>x1 ? fr(Math.atan2(fr(y2-y1), fr(x2-x1))) : fr(Math.atan2(fr(y1-y2), fr(x1-x2))))+PI_2;
          while(theta<0) theta+=PI;
          while(theta>=PI) theta-=PI;
          let l0=fr(y1-y2), l1=fr(x2-x1), l2=fr(fr(x1*y2)-fr(y1*x2));
          const ia=fr(1/fr(Math.sqrt(fr(fr(l0*l0)+fr(l1*l1)))));
          l0=fr(l0*ia); l1=fr(l1*ia); l2=fr(l2*ia);
          const nPixelsToTrim=Math.trunc(Math.min(5.0, n*0.1));
          let nOriInliers=0, nOriOutliers=0;
          for(let i=fi;i<=li;i++){
            const x=PX[i], y=PY[i];
            if(edgeImg[y*W+x]!==UPM_ED_SEGMENT_INLIER_PX) continue;
            const endpointDist=hor ? Math.min(Math.abs(x-lx), Math.abs(x-fx)) : Math.min(Math.abs(y-ly), Math.abs(y-fy));
            if(endpointDist<nPixelsToTrim) continue;
            let dot=0; dot=fr(dot+fr(x*l0)); dot=fr(dot+fr(y*l1)); dot=fr(dot+l2);
            const px=fr(x-fr(l0*dot)), py=fr(y-fr(l1*dot));
            if(px!==px || py!==py) continue;
            let x0=px<0 ? 0 : Math.trunc(px); if(x0>=W) x0=W-1;
            let y0=py<0 ? 0 : Math.trunc(py); if(y0>=H) y0=H-1;
            let xa=Math.trunc(fr(px+1)); if(xa>=W) xa=W-1;
            let ya=Math.trunc(fr(py+1)); if(ya>=H) ya=H-1;
            const tx=fr(px-Math.trunc(px)), ty=fr(py-Math.trunc(py)), r0=y0*W, r1=ya*W;
            const lerp_dx=blerp(dxImg[r0+x0], dxImg[r0+xa], dxImg[r1+x0], dxImg[r1+xa], tx, ty);
            const lerp_dy=blerp(dyImg[r0+x0], dyImg[r0+xa], dyImg[r1+x0], dyImg[r1+xa], tx, ty);
            let angle=fr(Math.atan2(lerp_dy, lerp_dx));
            if(angle<0) angle+=PI;
            if(angle>=PI) angle-=PI;
            if(circularDist(theta, angle, PI)>validationTh) nOriOutliers++; else nOriInliers++;
          }
          valid=nOriInliers>nOriOutliers;
          saliency=nOriInliers;
        }
      } else {
        const dx=fr(x1-x2), dy=fr(y1-y2);
        saliency=fr(Math.sqrt(fr(fr(dx*dx)+fr(dy*dy))));
      }
      if(valid) out.push({x1, y1, x2, y2, salience:saliency});
    }
    if(zeiten){
      const t5=now();
      zeiten.glaetten=t1-t0; zeiten.gradient=t2-t1; zeiten.anker=t3-t2; zeiten.zeichnen=t4-t3; zeiten.pruefen=t5-t4;
    }
    if(o.debug){
      const d=o.debug, bl=new Uint8Array(N);
      for(let y=0;y<H;y++) bl.set(P.subarray((y+1)*(W+2)+1, (y+1)*(W+2)+1+W), y*W);
      d.blur=bl; d.dx=dxImg.slice(0, N); d.dy=dyImg.slice(0, N); d.kern=kern; d.nAnker=nA; d.ankerSchwelle=anchorTh;
      d.nSegmenteVorPruefung=nS;
    }
    return out;
  };
})();
