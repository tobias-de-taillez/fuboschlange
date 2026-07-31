# Raumaufmaß online stellen (Vercel, statisch)

Die App ist eine einzelne HTML-Datei mit eingebettetem JavaScript: 234 KB,
71 KB über die Leitung, ein Request, kein Build, keine Dependencies. Sie
braucht kein Framework und keinen Server — nur einen Ort, der statische
Dateien ausliefert.

## Warum nicht v0.dev selbst

v0 erzeugt React/Next.js-Komponenten. Die App dorthin zu bringen hieße,
sie neu zu bauen (und die 189 Selbstchecks zu verlieren) oder sie in ein
`iframe` zu stopfen — ein Framework-Gerüst um etwas, das keins braucht.
Gehostet wird stattdessen direkt bei Vercel als statische Seite; das ist
dasselbe Ziel, nur ohne Umweg.

## Schritte

1. Repo bei GitHub anlegen (oder diesen Branch pushen).
2. Auf vercel.com: **Add New… → Project**, das Repo importieren.
3. Framework Preset: **Other**. Build Command und Output Directory **leer
   lassen** — es gibt nichts zu bauen.
4. Deploy. Die App liegt danach unter `/` (Rewrite in `vercel.json`) und
   zusätzlich unter `/raumaufmass.html`.

Jeder weitere Push auf den Standard-Branch deployt automatisch.

## Was die Konfigurationsdateien tun

- `vercel.json`: leitet `/` auf `raumaufmass.html` um (keine Kopie der
  Datei, kein zweiter Wartungsort), und setzt `must-revalidate` — sonst
  liefert der CDN-Cache nach einem Update tagelang die alte Fassung aus,
  und niemand versteht, warum die Korrektur nicht ankommt.
- `.vercelignore`: hält alles Übrige aus dem Deployment heraus. Das Repo
  enthält auch den Verlegeplaner, Spezifikationen und Testcode — nichts
  davon gehört auf die öffentliche Adresse.

## Zwei Dinge, die vor dem ersten echten Nutzer feststehen müssen

**Die Domain.** Räume liegen in `localStorage`, und der hängt am Origin.
Ein späterer Wechsel von `<projekt>.vercel.app` auf eine eigene Domain
bedeutet für jeden Nutzer: alle Räume weg. Also die endgültige Domain
zuweisen, bevor jemand ernsthaft misst.

**HTTPS.** Kommt bei Vercel automatisch und ist Pflicht: Zwischenablage
und Share-Sheet funktionieren ohne sicheren Kontext nicht.

## Zum Quelltext

Der Code ist über „Quelltext anzeigen" lesbar. Das ist bei jeder
Web-Anwendung so — auch bei React-Apps, dort nur gebündelt und dadurch
unbequemer. Verhindern ließe sich das nur, indem die Rechnung auf einem
Server liefe, was hier weder nötig noch gewollt ist. Wer Urheberschaft
regeln will, legt eine `LICENSE` daneben; das ist eine rechtliche, keine
technische Frage.
