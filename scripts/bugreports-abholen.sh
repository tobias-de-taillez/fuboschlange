#!/usr/bin/env bash
# Meldungen aus "Fehler / Wunsch melden" (raumaufmass.html -> bugreport.php)
# vom Server holen und DORT LOESCHEN. Sie liegen auf Hetzner ausserhalb von
# public_html unter ~/raumaufmass-bugreports/ und landen hier in bugreports/
# (gitignored). Geloescht wird auf dem Server nur, was lokal vollstaendig und
# als gueltiges JSON angekommen ist.
#
#   scripts/bugreports-abholen.sh                    # abholen, auf dem Server loeschen, Uebersicht
#   scripts/bugreports-abholen.sh --erledigt <id>    # lokale Arbeitskopie nach dem Debugging loeschen
#   scripts/bugreports-abholen.sh --benachrichtigung <mail>   # Hinweis-Mail bei neuer Meldung (nur auf dem Server abgelegt)
#   scripts/bugreports-abholen.sh --benachrichtigung aus
#
# Nachstellen: python3 -m http.server 8741, dann
#   http://localhost:8741/raumaufmass.html?meldung=bugreports/<id>.json
# Passwort aus dem macOS-Schluesselbund (siehe scripts/deploy-hetzner.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=bugreports
REMOTE=raumaufmass-bugreports
mkdir -p "$DIR"; chmod 700 "$DIR"

lftp_run() {
  local PW; PW="$(security find-generic-password -s hetzner-irazari-ftp -a ebrh7y -w 2>/dev/null)" || {
    echo "Kein Passwort im Schlüsselbund (siehe scripts/deploy-hetzner.sh)." >&2; exit 1; }
  LFTP_PASSWORD="$PW" lftp --env-password -u ebrh7y www795.your-server.de -e "set cmd:fail-exit true; set dns:order inet; set net:timeout 15; set net:max-retries 1; set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; $1; quit"
}

case "${1:-}" in
  --erledigt)
    ID="${2:-}"; [[ "$ID" =~ ^M-[0-9]{8}-[0-9]{6}-[0-9a-f]{6}$ ]] || { echo "Aufruf: --erledigt M-JJJJMMTT-HHMMSS-xxxxxx" >&2; exit 1; }
    rm -fv "$DIR/$ID".*
    exit 0 ;;
  --benachrichtigung)
    A="${2:-}"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
    if [ "$A" = aus ]; then lftp_run "mkdir -p -f $REMOTE; cd $REMOTE; rm -f .benachrichtigung"; echo "Benachrichtigung aus."; exit 0; fi
    [[ "$A" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo "Aufruf: --benachrichtigung <mail>|aus" >&2; exit 1; }
    printf '%s\n' "$A" > "$T/.benachrichtigung"
    lftp_run "mkdir -p -f $REMOTE; chmod 700 $REMOTE; cd $REMOTE; put $T/.benachrichtigung; chmod 600 .benachrichtigung"
    echo "Benachrichtigung an $A eingerichtet (nur auf dem Server, nicht im Repo)."; exit 0 ;;
  "") ;;
  *) sed -n '2,15p' "$0"; exit 1 ;;
esac

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
# Erst nur herunterladen. Fehlt die Ablage (noch nie eine Meldung), ist nichts zu tun.
if ! lftp_run "cd $REMOTE; mirror --verbose=0 -I 'M-*.json' . $T" 2>/dev/null; then
  echo "Keine Meldungen (Ablage ~/$REMOTE gibt es noch nicht)."; exit 0
fi
shopt -s nullglob
NEU=("$T"/M-*.json)
[ ${#NEU[@]} -gt 0 ] || { echo "Keine neuen Meldungen."; exit 0; }

# Pruefen, ablegen, Bild auspacken; nur die guten Namen fuer das Loeschen merken.
OKLISTE="$(python3 -I - "$DIR" "${NEU[@]}" <<'PY'
import base64, json, os, re, sys
ziel, dateien = sys.argv[1], sys.argv[2:]
for f in dateien:
    name = os.path.basename(f)
    if not re.fullmatch(r'M-\d{8}-\d{6}-[0-9a-f]{6}\.json', name):
        print(f'  übersprungen (Name): {name}', file=sys.stderr); continue
    try:
        m = json.load(open(f, encoding='utf-8'))
        assert isinstance(m, dict) and m.get('id') == name[:-5]
    except Exception as e:
        print(f'  übersprungen (kaputt): {name}: {e}', file=sys.stderr); continue
    out = os.path.join(ziel, name)
    with open(out, 'w', encoding='utf-8') as o: json.dump(m, o, ensure_ascii=False, indent=1)
    os.chmod(out, 0o600)
    b = m.get('bild')
    if isinstance(b, str):
        mt = re.match(r'data:image/(jpeg|png);base64,', b)
        if mt:
            p = os.path.join(ziel, name[:-5] + ('.jpg' if mt.group(1) == 'jpeg' else '.png'))
            open(p, 'wb').write(base64.b64decode(b[mt.end():])); os.chmod(p, 0o600)
    z = m.get('zustand') or {}
    ui = z.get('ui') or {}
    log = z.get('log') or []
    text = ' '.join(str(m.get('text', '')).split())
    print(f"{m['id']}  {m.get('art')}  Stand {z.get('stand')}  Modus {ui.get('mode')}  "
          f"Log {len(log)}  Räume {len(json.loads((z.get('speicher') or {}).get('raumaufmass.rooms') or '[]'))}", file=sys.stderr)
    print(f"    „{text[:200]}{'…' if len(text) > 200 else ''}“" + (f"  Kontakt: {m['kontakt']}" if m.get('kontakt') else ''), file=sys.stderr)
    print(name)
PY
)"
[ -n "$OKLISTE" ] || { echo "Nichts gültig angekommen – auf dem Server bleibt alles liegen." >&2; exit 1; }

RM=""; for n in $OKLISTE; do RM="$RM; rm $n"; done
lftp_run "cd $REMOTE$RM" >/dev/null
echo
echo "$(echo "$OKLISTE" | wc -l | tr -d ' ') Meldung(en) in $DIR/, auf dem Server gelöscht."
echo "Nachstellen: http://localhost:8741/raumaufmass.html?meldung=$DIR/<id>.json"
echo "Nach dem Debugging: scripts/bugreports-abholen.sh --erledigt <id>"
