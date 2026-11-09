#!/usr/bin/env bash
# Raumaufmass auf Hetzner (raumaufmass.irazari-te.ch) bringen.
# Baut den Upload aus dem Stand von main und laedt ihn per FTPS nach
# public_html/raumaufmass/. Loescht nichts auf dem Server.
#
# Die Seite besteht aus der HTML-Datei und den geteilten JS-Dateien der
# Werkzeugfamilie (docs/adr/0001-familie-mit-geteilten-js-dateien.md). Beides
# kommt aus demselben Stand, geht gemeinsam hoch und wird Datei fuer Datei
# per Hash gegen die ausgelieferte Fassung geprueft.
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
# Geteilte Dateien: genau die, die diese HTML-Datei per <script src> laedt.
# Aus der Datei gelesen statt als Liste gepflegt, damit Seite und Upload nicht
# auseinanderlaufen. Fehlt eine davon in main, bricht git show hier ab.
GETEILT=()
while IFS= read -r f; do GETEILT+=("$f"); done < <(grep -o '<script src="[^"]*"' "$OUT/index.html" | sed 's/^<script src="//; s/"$//' | sort -u)
if [ "${#GETEILT[@]}" -gt 0 ]; then
  for f in "${GETEILT[@]}"; do
    [[ "$f" =~ ^[a-z0-9-]+\.js$ ]] || { echo "Unerwartetes Skript in raumaufmass.html: $f – Abbruch." >&2; exit 1; }
    git show "main:$f" > "$OUT/$f"
  done
fi
git show main:fliese-einmessen.html > "$OUT/fliese-einmessen.html"
# Empfaenger der Meldungen; legt sie ausserhalb von public_html ab.
git show main:bugreport.php         > "$OUT/bugreport.php"
# Datenschutzhinweis zum Meldedialog (dort nur verlinkt).
git show main:datenschutz-meldung.html > "$OUT/datenschutz-meldung.html"
cat > "$OUT/.htaccess" <<'HT'
# HTML und geteilte Skripte immer frisch laden: neue Versionen sollen sofort
# ankommen, und eine neue Seite darf nie auf alte Skripte aus dem Cache treffen.
<FilesMatch "\.(html|js)$">
  Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>
DirectoryIndex index.html
HT

echo "Lade $(git rev-parse --short main) hoch …"
LFTP_PASSWORD="$PW" lftp --env-password -u ebrh7y www795.your-server.de -e "set dns:order inet; set net:timeout 15; set net:max-retries 1; set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; mirror --reverse --verbose --exclude-glob index.html $OUT public_html/raumaufmass; put -O public_html/raumaufmass $OUT/index.html; quit"
# Reihenfolge oben: erst alles ausser index.html, dann index.html. Die neue
# Seite geht so erst online, wenn ihre geteilten Dateien schon liegen.
# Hash pruefen: lokal = HTTPS. bugreport.php wird dort ausgefuehrt,
# also nur pruefen, dass es antwortet und POST verlangt.
L="$(shasum -a 256 "$OUT/index.html" | cut -d' ' -f1)"
H="$(curl -fsS "https://raumaufmass.irazari-te.ch/?nc=$RANDOM$RANDOM" | shasum -a 256 | cut -d' ' -f1)"
echo "lokal $L"; echo "https $H"
[ "$L" = "$H" ] || { echo "Hash weicht ab – Upload prüfen!" >&2; exit 1; }
# Dasselbe fuer jede geteilte Datei: HTML und Skripte muessen aus einem Stand sein.
if [ "${#GETEILT[@]}" -gt 0 ]; then
  for f in "${GETEILT[@]}"; do
    LF="$(shasum -a 256 "$OUT/$f" | cut -d' ' -f1)"
    HF="$(curl -fsS "https://raumaufmass.irazari-te.ch/$f?nc=$RANDOM$RANDOM" | shasum -a 256 | cut -d' ' -f1)"
    echo "$f: lokal ${LF:0:16} https ${HF:0:16}"
    [ "$LF" = "$HF" ] || { echo "Hash weicht ab bei $f – Upload prüfen!" >&2; exit 1; }
  done
fi
C="$(curl -s -o /dev/null -w '%{http_code}' "https://raumaufmass.irazari-te.ch/bugreport.php")"
[ "$C" = 405 ] || { echo "bugreport.php antwortet mit $C statt 405 – prüfen!" >&2; exit 1; }
D="$(curl -s -o /dev/null -w '%{http_code}' "https://raumaufmass.irazari-te.ch/datenschutz-meldung.html")"
[ "$D" = 200 ] || { echo "datenschutz-meldung.html antwortet mit $D statt 200 – prüfen!" >&2; exit 1; }
echo "Fertig: https://raumaufmass.irazari-te.ch (Stand $STAND, sha256 ${L:0:8}, ${#GETEILT[@]} geteilte Dateien geprüft, bugreport.php ok)"
