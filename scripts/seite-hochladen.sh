#!/usr/bin/env bash
# Eine einzelne Seite aus dem Repo-Wurzelordner auf Hetzner bringen (raumaufmass.irazari-te.ch/<datei>.html),
# z. B. kamera-messung.html. Wie scripts/raumskizze-deploy.sh, aber ohne Stand-Zaehler und ohne Commit:
# bricht ab, wenn die Datei nicht committet ist oder ungesicherte Aenderungen hat; gibt es test/<name>.mjs,
# muss dessen letzte Zeile „ALLE CHECKS GRÜN“ sein. Laedt genau diese eine Datei per FTPS nach
# public_html/raumaufmass/ und prueft den Hash dreifach: lokal = FTP-Ruecklesen = HTTPS. Loescht nichts
# auf dem Server (get -e loescht nur die lokale Zieldatei im Temp-Ordner vor dem Ruecklesen). cmd:fail-exit: scheitert
# das cd in lftp, bricht es ab, statt die Datei in den FTP-Stammordner zu legen.
#
#   scripts/seite-hochladen.sh kamera-messung.html      # NODE=/pfad/node fuer ein anderes node
#
# raumskizze-probe.html nie hiermit: die zaehlt ihren Stand hoch, das macht scripts/raumskizze-deploy.sh.
# Passwort kommt aus dem macOS-Schluesselbund (siehe scripts/deploy-hetzner.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
NODE="${NODE:-node}"

[ $# -eq 1 ] || { echo "Aufruf: scripts/seite-hochladen.sh <datei.html>" >&2; exit 1; }
F="${1#./}"
# Nur ein schlichter Dateiname im Wurzelordner: kein Pfad, kein Leerzeichen, nichts, was im lftp-Befehl
# unten (put/get in einer Zeichenkette) etwas anderes hiesse.
[[ "$F" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.html$ ]] || {
  echo "Nur Dateien im Repo-Wurzelordner mit Endung .html (Buchstaben, Ziffern, . _ -), nicht „$1“." >&2; exit 1; }
# Klein geschrieben vergleichen: das Volume (APFS) unterscheidet Gross/Klein nicht, RAUMSKIZZE-PROBE.HTML waere dieselbe
# Datei. tr statt ${F,,}: /bin/bash auf macOS ist 3.2 und kennt das nicht (bash -n merkt es nicht).
FK="$(printf '%s' "$F" | tr '[:upper:]' '[:lower:]')"
[ "$FK" != raumskizze-probe.html ] || {
  echo "raumskizze-probe.html nur mit scripts/raumskizze-deploy.sh (Stand-Zähler)." >&2; exit 1; }
[ -f "$F" ] && [ ! -L "$F" ] || { echo "$F gibt es im Repo-Wurzelordner nicht (oder ist ein Link)." >&2; exit 1; }
# git diff schweigt bei einer neuen, nie committeten Datei - darum zuerst: ist sie ueberhaupt im Repo?
git ls-files --error-unmatch -- "$F" >/dev/null 2>&1 || { echo "$F ist nicht im Repo – erst committen." >&2; exit 1; }
git diff --quiet -- "$F" && git diff --cached --quiet -- "$F" || {
  echo "$F hat ungesicherte Änderungen – erst committen." >&2; exit 1; }

T="test/${F%.html}.mjs"
if [ -f "$T" ]; then
  # Der Selbsttest gilt nur so, wie er im Repo steht (ein lokal geschwaechter, ungetrackter Test genuegt nicht) ...
  git ls-files --error-unmatch -- "$T" >/dev/null 2>&1 || { echo "$T ist nicht im Repo – erst committen." >&2; exit 1; }
  git diff --quiet -- "$T" && git diff --cached --quiet -- "$T" || { echo "$T hat ungesicherte Änderungen – erst committen." >&2; exit 1; }
  # ... und ohne die Umgebung des Aufrufers: KAMERA_MESSUNG_HTML o. ae. liesse ihn eine andere Seite pruefen.
  # Die Tests des Repos schreiben GRÜN, einer GRUEN; beides gilt.
  env -i PATH="$PATH" HOME="$HOME" "$NODE" "$T" | tail -1 | grep -Eq 'ALLE CHECKS GR(Ü|UE)N' || { echo "Selbsttest $T nicht grün – kein Upload." >&2; exit 1; }
  echo "Selbsttest $T grün."
fi

PW="$(security find-generic-password -s hetzner-irazari-ftp -a ebrh7y -w 2>/dev/null)" || {
  echo "Kein Passwort im Schlüsselbund (siehe scripts/deploy-hetzner.sh)." >&2; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
LFTP_PASSWORD="$PW" lftp --env-password -u ebrh7y www795.your-server.de -e "set cmd:fail-exit true; set dns:order inet; set net:timeout 15; set net:max-retries 1; set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; cd public_html/raumaufmass; put $F; get -O $TMP -e $F; quit" >/dev/null
unset PW
L="$(shasum -a 256 "$F" | cut -d' ' -f1)"
R="$(shasum -a 256 "$TMP/$F" | cut -d' ' -f1)"
H="$(curl -fsS "https://raumaufmass.irazari-te.ch/$F?nc=$RANDOM$RANDOM" | shasum -a 256 | cut -d' ' -f1)" || {
  echo "HTTPS-Abruf von $F fehlgeschlagen – Upload prüfen!" >&2; exit 1; }
echo "lokal $L"; echo "ftp   $R"; echo "https $H"
[ "$L" = "$R" ] && [ "$L" = "$H" ] || { echo "Hash weicht ab – Upload prüfen!" >&2; exit 1; }
echo "$F live: https://raumaufmass.irazari-te.ch/$F ($(git log -1 --format=%h -- "$F"), sha256 ${L:0:8})."
