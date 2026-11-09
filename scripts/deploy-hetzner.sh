#!/usr/bin/env bash
# Raumaufmass auf Hetzner (raumaufmass.irazari-te.ch) bringen.
# Baut den Upload aus dem Stand von main und laedt ihn per FTPS nach
# public_html/raumaufmass/. Loescht nichts auf dem Server.
#
# Passwort kommt aus dem macOS-Schluesselbund. Einmalig ablegen
# (Passwort vorher in konsoleH -> Logindaten -> FTP-Hauptbenutzer kopieren):
#   security add-generic-password -U -s hetzner-irazari-ftp -a ebrh7y -w "$(pbpaste)"
# Details: docs/handoff-hetzner-webhosting.md
set -euo pipefail
cd "$(dirname "$0")/.."

PW="$(security find-generic-password -s hetzner-irazari-ftp -a ebrh7y -w 2>/dev/null)" || {
  echo "Kein Passwort im Schlüsselbund. Einmalig ablegen:" >&2
  echo '  security add-generic-password -U -s hetzner-irazari-ftp -a ebrh7y -w "$(pbpaste)"' >&2
  exit 1; }

OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT
STAND="$(git rev-parse --short main)"
# Der Stand landet in jeder "Fehler / Wunsch melden"-Meldung (MELDUNG_STAND).
git show main:raumaufmass.html | sed "s/__MELDUNG_STAND__/$STAND/" > "$OUT/index.html"
grep -q "MELDUNG_STAND='$STAND'" "$OUT/index.html" || { echo "Stand nicht eingesetzt – Abbruch." >&2; exit 1; }
git show main:fliese-einmessen.html > "$OUT/fliese-einmessen.html"
# Empfaenger der Meldungen; legt sie ausserhalb von public_html ab.
git show main:bugreport.php         > "$OUT/bugreport.php"
# Datenschutzhinweis zum Meldedialog (dort nur verlinkt).
git show main:datenschutz-meldung.html > "$OUT/datenschutz-meldung.html"
cat > "$OUT/.htaccess" <<'HT'
# HTML immer frisch laden: neue Versionen sollen sofort ankommen.
<FilesMatch "\.html$">
  Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>
DirectoryIndex index.html
HT

echo "Lade $(git rev-parse --short main) hoch …"
LFTP_PASSWORD="$PW" lftp --env-password -u ebrh7y www795.your-server.de -e "set dns:order inet; set net:timeout 15; set net:max-retries 1; set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; mirror --reverse --verbose $OUT public_html/raumaufmass; quit"
# Hash pruefen: lokal = HTTPS. bugreport.php wird dort ausgefuehrt,
# also nur pruefen, dass es antwortet und POST verlangt.
L="$(shasum -a 256 "$OUT/index.html" | cut -d' ' -f1)"
H="$(curl -fsS "https://raumaufmass.irazari-te.ch/?nc=$RANDOM$RANDOM" | shasum -a 256 | cut -d' ' -f1)"
echo "lokal $L"; echo "https $H"
[ "$L" = "$H" ] || { echo "Hash weicht ab – Upload prüfen!" >&2; exit 1; }
C="$(curl -s -o /dev/null -w '%{http_code}' "https://raumaufmass.irazari-te.ch/bugreport.php")"
[ "$C" = 405 ] || { echo "bugreport.php antwortet mit $C statt 405 – prüfen!" >&2; exit 1; }
D="$(curl -s -o /dev/null -w '%{http_code}' "https://raumaufmass.irazari-te.ch/datenschutz-meldung.html")"
[ "$D" = 200 ] || { echo "datenschutz-meldung.html antwortet mit $D statt 200 – prüfen!" >&2; exit 1; }
echo "Fertig: https://raumaufmass.irazari-te.ch (Stand $STAND, sha256 ${L:0:8}, bugreport.php ok)"
