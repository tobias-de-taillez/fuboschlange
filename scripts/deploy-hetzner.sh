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
git show main:raumaufmass.html      > "$OUT/index.html"
git show main:fliese-einmessen.html > "$OUT/fliese-einmessen.html"
cat > "$OUT/.htaccess" <<'HT'
# HTML immer frisch laden: neue Versionen sollen sofort ankommen.
<FilesMatch "\.html$">
  Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>
DirectoryIndex index.html
HT

echo "Lade $(git rev-parse --short main) hoch …"
LFTP_PASSWORD="$PW" lftp --env-password -u ebrh7y www795.your-server.de -e "set dns:order inet; set net:timeout 15; set net:max-retries 1; set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; mirror --reverse --verbose $OUT public_html/raumaufmass; quit"
echo "Fertig: https://raumaufmass.irazari-te.ch"
