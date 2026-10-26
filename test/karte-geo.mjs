// Ab Stand 7 traegt die Seite M3-M10 wortgleich im geo-Block. Die Modultests pruefen ihr Modul aber gegen
// Platzhalter der anderen Module (wie bis Stand 6): geoOhneKarte nimmt die wortgleichen Bloecke M3-M10 wieder
// heraus, damit jeder Test dieselbe Umgebung hat wie vorher. Ob die Seite die Dateien wortgleich traegt, prueft
// test/raumskizze-probe.mjs; den Verbund aller Module rechnet raumskizze-karte.mjs (T1).
import {readFileSync} from 'node:fs';

export const KARTE_MODULE=['raumskizze-segmente.js', 'raumskizze-abschnitte.js', 'raumskizze-landmarken.js', 'raumskizze-ausgleich.js',
  'raumskizze-umriss.js', 'raumskizze-ringe.js', 'raumskizze-tiefe.js', 'raumskizze-kartenlauf.js'];
export function geoOhneKarte(geo){
  for(const f of KARTE_MODULE){ const b='{\n'+readFileSync(new URL('../'+f, import.meta.url), 'utf8')+'}\n'; if(geo.includes(b)) geo=geo.replace(b, ''); }
  return geo;
}
