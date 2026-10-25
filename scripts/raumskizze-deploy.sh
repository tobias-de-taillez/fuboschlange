#!/usr/bin/env bash
# Raumskizze-Probe auf Hetzner bringen (raumaufmass.irazari-te.ch/raumskizze-probe.html).
# Zaehlt den Stand hoch (Nummer und Zeitpunkt, sichtbar auf der Seite und in der
# AR-Statuszeile), prueft den Selbsttest, committet, laedt die eine Datei per FTPS
# nach public_html/raumaufmass/ und prueft den Hash dreifach: lokal = FTP-Ruecklesen
# = HTTPS. Loescht nichts auf dem Server.
#
#   scripts/raumskizze-deploy.sh            # NODE=/pfad/node fuer ein anderes node
#
# Passwort kommt aus dem macOS-Schluesselbund (siehe scripts/deploy-hetzner.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
F=raumskizze-probe.html
NODE="${NODE:-node}"

git diff --quiet -- "$F" && git diff --cached --quiet -- "$F" || {
  echo "$F hat ungesicherte Änderungen – erst committen." >&2; exit 1; }
"$NODE" test/raumskizze-probe.mjs | tail -1 | grep -q "ALLE CHECKS GRÜN" || {
  echo "Selbsttest nicht grün – kein Upload." >&2; exit 1; }

PW="$(security find-generic-password -s hetzner-irazari-ftp -a ebrh7y -w 2>/dev/null)" || {
  echo "Kein Passwort im Schlüsselbund (siehe scripts/deploy-hetzner.sh)." >&2; exit 1; }

ALT="$(sed -n "s/^const STAND={nr:\([0-9]*\), zeit:'[^']*'};$/\1/p" "$F")"
[ -n "$ALT" ] || { echo "Zeile 'const STAND={nr:…, zeit:…};' nicht gefunden." >&2; exit 1; }
NR=$((ALT+1)); ZEIT="$(date +%Y-%m-%dT%H:%M:%S%z | sed 's/\(..\)$/:\1/')"
sed -i '' "s/^const STAND={nr:[0-9]*, zeit:'[^']*'};$/const STAND={nr:$NR, zeit:'$ZEIT'};/" "$F"
git add "$F"; git commit -q -m "chore(raumskizze): Stand $NR"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
LFTP_PASSWORD="$PW" lftp --env-password -u ebrh7y www795.your-server.de -e "set dns:order inet; set net:timeout 15; set net:max-retries 1; set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; cd public_html/raumaufmass; put $F; get -O $TMP -e $F; quit" >/dev/null
unset PW
L="$(shasum -a 256 "$F" | cut -d' ' -f1)"
R="$(shasum -a 256 "$TMP/$F" | cut -d' ' -f1)"
H="$(curl -s "https://raumaufmass.irazari-te.ch/$F?nc=$RANDOM" | shasum -a 256 | cut -d' ' -f1)"
echo "lokal $L"; echo "ftp   $R"; echo "https $H"
[ "$L" = "$R" ] && [ "$L" = "$H" ] || { echo "Hash weicht ab – Upload prüfen!" >&2; exit 1; }
echo "Stand $NR live ($ZEIT, $(git rev-parse --short HEAD), sha256 ${L:0:8})."
