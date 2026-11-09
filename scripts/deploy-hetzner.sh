#!/usr/bin/env bash
# Raumaufmaß-Familie auf Hetzner (raumaufmass.irazari-te.ch) bringen.
# Baut den Upload aus einem Git-Stand (ohne Angabe: main) und lädt ihn per FTPS
# nach public_html/raumaufmass/. Löscht nichts auf dem Server.
#
#   scripts/deploy-hetzner.sh                       Stand von main hochladen
#   scripts/deploy-hetzner.sh <Tag|Commit>          genau diesen Stand hochladen
#   scripts/deploy-hetzner.sh --probe <Ordner> [<Tag|Commit>]
#       Probelauf ohne Server und ohne Passwort: derselbe Ablauf mit lftp in
#       einen vorhandenen lokalen Ordner außerhalb des Repos, Hash-Prüfung aus
#       dem Ordner.
#       Mit --probe-url <Adresse> zusätzlich: Prüfung per HTTP gegen einen
#       lokalen Server, der diesen Ordner ausliefert.
#
# Rückweg auf den Stand vor dem Familien-Umbau (Tag vor-familie-umbau):
#   scripts/deploy-hetzner.sh vor-familie-umbau
# Lädt genau diesen Stand (raumaufmass.html wieder als index.html); neuere Dateien bleiben liegen und werden genannt.
#
# Die Seite ist eine Werkzeugfamilie aus mehreren HTML-Dateien und geteilten
# JS-Dateien (docs/adr/0001-familie-mit-geteilten-js-dateien.md):
#   raeume.html       Startbildschirm; geht als raeume.html UND als index.html hoch
#   raumaufmass.html  das Werkzeug, unter seinem eigenen Namen
#   raum-*.js         was die Seiten per <script src> laden (aus den Seiten gelesen)
#   fliese-einmessen.html, datenschutz-meldung.html, bugreport.php wie bisher
# Gibt es im Stand kein raeume.html (alte Stände), ist raumaufmass.html die
# Einstiegsseite und geht wie früher als index.html hoch.
# Alles kommt aus demselben Stand, index.html geht zuletzt hoch, und jede Datei
# wird danach per Hash gegen die ausgelieferte Fassung geprüft.
#
# Passwort kommt aus dem macOS-Schlüsselbund. Einmalig ablegen
# (Passwort vorher in konsoleH -> Logindaten -> FTP-Hauptbenutzer kopieren):
#   security add-generic-password -U -s hetzner-irazari-ftp -a ebrh7y -w "$(pbpaste)"
# Details: docs/handoff-hetzner-webhosting.md
set -euo pipefail
AUFRUFORDNER="$PWD"
cd "$(dirname "$0")/.."

ADRESSE="https://raumaufmass.irazari-te.ch"
SERVERORDNER="public_html/raumaufmass"

abbruch() { echo "Abbruch: $*" >&2; exit 1; }

# --- Aufruf ---------------------------------------------------------------
ZIEL=main; ZIEL_GENANNT=0; PROBE=""; PROBE_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --probe)     [ $# -ge 2 ] || abbruch "--probe braucht einen Ordner."; PROBE="$2"; shift 2 ;;
    --probe-url) [ $# -ge 2 ] || abbruch "--probe-url braucht eine Adresse."; PROBE_URL="${2%/}"; shift 2 ;;
    -h|--help)   sed -n '2,/^set -euo/p' "scripts/$(basename "$0")" | sed '$d; s/^# \{0,1\}//'; exit 0 ;;
    -*)          abbruch "Unbekannte Option $1 (Hilfe: --help)." ;;
    *)           [ "$ZIEL_GENANNT" = 0 ] || abbruch "Nur ein Stand möglich, bekommen: $ZIEL und $1."
                 ZIEL="$1"; ZIEL_GENANNT=1; shift ;;
  esac
done
[ -z "$PROBE_URL" ] || [ -n "$PROBE" ] || abbruch "--probe-url gibt es nur zusammen mit --probe <Ordner>."

COMMIT="$(git rev-parse --verify --quiet "${ZIEL}^{commit}")" || abbruch "Den Stand $ZIEL gibt es in diesem Repo nicht (Tag, Zweig oder Commit erwartet)."
STAND="$(git rev-parse --short "$COMMIT")"

# lftp bekommt Pfade in doppelten Anführungszeichen; was die aufbrechen würde, lehnen wir ab.
lftp_tauglich() { case "$1" in *\"*|*\\*|*\$*) abbruch "Pfad mit \", \\ oder \$ geht nicht: $1" ;; esac; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/upload"; KOPF="$TMP/kopf"; mkdir "$OUT"
lftp_tauglich "$OUT"

if [ -n "$PROBE" ]; then
  case "$PROBE" in /*) ;; *) PROBE="$AUFRUFORDNER/$PROBE" ;; esac
  [ -d "$PROBE" ] || abbruch "Den Probe-Ordner gibt es nicht (vorher anlegen): $PROBE"
  PROBE="$(cd "$PROBE" && pwd -P)"
  REPO="$(pwd -P)"
  case "$PROBE/" in "$REPO/"*) abbruch "Der Probe-Ordner darf nicht im Repo liegen: $PROBE" ;; esac
  lftp_tauglich "$PROBE"
  ZIELORDNER="$PROBE"
else
  ZIELORDNER="$SERVERORDNER"
  PW="$(security find-generic-password -s hetzner-irazari-ftp -a ebrh7y -w 2>/dev/null)" || {
    echo "Kein Passwort im Schlüsselbund. Einmalig ablegen:" >&2
    echo '  security add-generic-password -U -s hetzner-irazari-ftp -a ebrh7y -w "$(pbpaste)"' >&2
    exit 1; }
fi

# --- Dateien des Stands zusammenstellen -------------------------------------
DATEIEN=()        # Namen wie im Repo; so heißen sie auch auf dem Server
im_stand() { git cat-file -e "$COMMIT:$1" 2>/dev/null; }
schon_dabei() {
  local x
  [ "${#DATEIEN[@]}" -gt 0 ] || return 1
  for x in "${DATEIEN[@]}"; do [ "$x" = "$1" ] && return 0; done
  return 1
}
# aufnehmen <Datei> <wer sie braucht>: holt die Datei aus dem Stand; fehlt sie dort, ist Schluss.
aufnehmen() {
  if schon_dabei "$1"; then return 0; fi
  im_stand "$1" || abbruch "$2 verweist auf $1, aber $1 fehlt im Stand $STAND ($ZIEL). Nichts hochgeladen."
  git show "$COMMIT:$1" > "$OUT/$1"
  DATEIEN+=("$1")
}
# Was eine Seite per <script src> lädt. Aus der Datei gelesen statt als Liste
# gepflegt, damit Seiten und Upload nicht auseinanderlaufen.
skripte_von() {
  LC_ALL=C grep -oE "<script[^>]*[[:space:]]src=[\"'][^\"']*[\"']" "$1" \
    | LC_ALL=C sed -E "s/^.*src=[\"']//; s/[\"']\$//" | sort -u || true
}
# Seiten und PHP-Dateien neben der Seite, auf die eine Datei verweist
# (href="raeume.html", location='raumaufmass.html#…', fetch('bugreport.php')):
# ein Name in Anführungszeichen, danach das Ende, ? oder #.
verweise_von() {
  LC_ALL=C grep -oE "[\"'\`](\\./)?[a-z0-9-]+\\.(html|php)[\"'\`?#]" "$1" \
    | LC_ALL=C sed -E "s/^.//; s/.\$//; s/^\\.\\///" | sort -u || true
}

im_stand raumaufmass.html || abbruch "Im Stand $STAND ($ZIEL) gibt es kein raumaufmass.html."
if im_stand raeume.html; then EINSTIEG=raeume.html; else EINSTIEG=raumaufmass.html; fi
aufnehmen "$EINSTIEG" "der Upload"
aufnehmen raumaufmass.html "der Upload"
# Beigaben wie bisher: Einmess-Werkzeug, Empfänger der Meldungen (legt sie
# außerhalb von public_html ab), Datenschutzhinweis zum Meldedialog. In alten
# Ständen fehlen sie zum Teil; dann gehen sie nicht mit, außer eine Seite
# verweist darauf (das fängt die Schleife unten ab).
NICHT_IM_STAND=()
for f in fliese-einmessen.html bugreport.php datenschutz-meldung.html; do
  if im_stand "$f"; then aufnehmen "$f" "der Upload"; else NICHT_IM_STAND+=("$f"); fi
done
# Verweisen folgen, bis nichts Neues mehr dazukommt. DATEIEN wächst dabei.
i=0
while [ "$i" -lt "${#DATEIEN[@]}" ]; do
  f="${DATEIEN[$i]}"; i=$((i+1))
  case "$f" in *.html)
    while IFS= read -r s; do
      [ -n "$s" ] || continue
      [[ "$s" =~ ^[a-z0-9-]+\.js$ ]] || abbruch "Unerwartetes Skript in $f: $s (erwartet: Datei neben der Seite, nur a-z, 0-9, Bindestrich)."
      aufnehmen "$s" "$f"
    done < <(skripte_von "$OUT/$f") ;;
  esac
  case "$f" in *.html|*.js)
    while IFS= read -r s; do
      [ -n "$s" ] || continue
      [ "$s" != index.html ] || continue      # index.html ist die Einstiegsseite selbst
      aufnehmen "$s" "$f"
    done < <(verweise_von "$OUT/$f") ;;
  esac
done

# Der Stand landet in jeder "Fehler / Wunsch melden"-Meldung (MELDUNG_STAND).
# Gesetzt wird er in jeder Datei, die den Platzhalter trägt.
GESTEMPELT=()
for f in "${DATEIEN[@]}"; do
  if LC_ALL=C grep -q '__MELDUNG_STAND__' "$OUT/$f"; then
    LC_ALL=C sed "s/__MELDUNG_STAND__/$STAND/g" "$OUT/$f" > "$TMP/stempel"
    mv "$TMP/stempel" "$OUT/$f"
    if LC_ALL=C grep -q '__MELDUNG_STAND__' "$OUT/$f" || ! LC_ALL=C grep -q "$STAND" "$OUT/$f"; then
      abbruch "Stand nicht eingesetzt in $f."
    fi
    GESTEMPELT+=("$f")
  fi
done
if [ "${#GESTEMPELT[@]}" -eq 0 ]; then
  for f in "${DATEIEN[@]}"; do
    if LC_ALL=C grep -q 'MELDUNG_STAND' "$OUT/$f"; then
      abbruch "$f benutzt MELDUNG_STAND, aber der Platzhalter __MELDUNG_STAND__ fehlt im ganzen Stand."
    fi
  done
fi

cp "$OUT/$EINSTIEG" "$OUT/index.html"
cat > "$OUT/.htaccess" <<'HT'
# HTML und geteilte Skripte immer frisch laden: neue Versionen sollen sofort
# ankommen, und eine neue Seite darf nie auf alte Skripte aus dem Cache treffen.
<FilesMatch "\.(html|js)$">
  Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>
DirectoryIndex index.html
HT

# Reihenfolge: erst Skripte und Beigaben, dann die Seiten unter ihrem eigenen
# Namen, ganz zuletzt index.html. Die Adresse der Seite zeigt den neuen Stand
# so erst, wenn alles, was er lädt und verlinkt, schon liegt.
ERST=(.htaccess); SEITEN=()
for f in "${DATEIEN[@]}"; do
  case "$f" in *.html) SEITEN+=("$f") ;; *) ERST+=("$f") ;; esac
done

echo "Stand $STAND ($ZIEL)"
if [ "$EINSTIEG" = raeume.html ]; then
  echo "Einstieg: raeume.html, als index.html und als raeume.html"
else
  echo "Einstieg: raumaufmass.html, als index.html und als raumaufmass.html (im Stand gibt es kein raeume.html)"
fi
echo "Dateien: ${ERST[*]} | ${SEITEN[*]} | index.html"
if [ "${#GESTEMPELT[@]}" -gt 0 ]; then
  echo "Stand-Stempel $STAND gesetzt in: ${GESTEMPELT[*]}"
else
  echo "Kein Stand-Stempel: keine Datei in diesem Stand trägt __MELDUNG_STAND__."
fi
if [ "${#NICHT_IM_STAND[@]}" -gt 0 ]; then
  echo "Nicht im Stand, geht nicht mit: ${NICHT_IM_STAND[*]}"
fi

# --- Hochladen ----------------------------------------------------------------
# cmd:fail-exit: scheitert eine Datei, bricht lftp sofort ab; index.html geht dann nicht mehr hoch.
lftp_lauf() {
  if [ -n "$PROBE" ]; then
    # Lokal würde lftp vorhandene Dateien sonst als name~Zeitstempel~ aufheben statt sie zu ersetzen.
    lftp -e "set cmd:fail-exit true; set xfer:make-backup false; set xfer:clobber true; $1; quit" "file://localhost/"
  else
    LFTP_PASSWORD="$PW" lftp --env-password -u ebrh7y www795.your-server.de -e "set cmd:fail-exit true; set dns:order inet; set net:timeout 15; set net:max-retries 1; set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; $1; quit"
  fi
}
# put statt mirror: lädt genau diese Dateien und überschreibt immer, auch wenn
# auf dem Server eine gleich große, neuere Fassung liegt (Rückweg).
BEFEHL="put -O \"$ZIELORDNER\""
for f in "${ERST[@]}"; do BEFEHL+=" \"$OUT/$f\""; done
BEFEHL+="; put -O \"$ZIELORDNER\""
for f in "${SEITEN[@]}"; do BEFEHL+=" \"$OUT/$f\""; done
BEFEHL+="; put -O \"$ZIELORDNER\" \"$OUT/index.html\""

if [ -n "$PROBE" ]; then
  echo "Probelauf: lade nach $PROBE (kein Server) …"
else
  echo "Lade hoch nach $SERVERORDNER …"
fi
lftp_lauf "$BEFEHL" || abbruch "Upload gescheitert (Meldung von lftp steht darüber), nichts geprüft. index.html wäre als Letzte hochgegangen."

# --- Prüfen: lokal = ausgeliefert -----------------------------------------------
if [ -z "$PROBE" ]; then BASIS="$ADRESSE"; else BASIS="$PROBE_URL"; fi
# hole <Name>: ausgelieferte Fassung auf stdout; leerer Name = Adresse der Seite.
hole() {
  if [ -n "$BASIS" ]; then
    curl -fsS -D "$KOPF" "$BASIS/$1?nc=$RANDOM$RANDOM"
  else
    cat "$PROBE/${1:-index.html}"
  fi
}
GEPRUEFT=0
# pruefe <Name auf dem Server> <lokale Datei>
pruefe() {
  local l h anzeige="${1:-/ (Adresse der Seite)}"
  l="$(shasum -a 256 "$OUT/$2" | cut -d' ' -f1)"
  h="$(hole "$1" | shasum -a 256 | cut -d' ' -f1)" || { echo "$anzeige ist nicht abrufbar – Upload prüfen!" >&2; exit 1; }
  echo "$anzeige: lokal ${l:0:16} ausgeliefert ${h:0:16}"
  [ "$l" = "$h" ] || { echo "Hash weicht ab bei $anzeige – Upload prüfen!" >&2; exit 1; }
  # Auf dem echten Server muss .htaccess den Cache für jede HTML- und JS-Datei abschalten.
  if [ -z "$PROBE" ]; then
    case "$2" in *.html|*.js)
      LC_ALL=C grep -qiE '^cache-control:.*no-cache' "$KOPF" || { echo "Cache-Control: no-cache fehlt bei $anzeige – .htaccess prüfen!" >&2; exit 1; } ;;
    esac
  fi
  GEPRUEFT=$((GEPRUEFT+1))
}
pruefe "" index.html
[ -z "$BASIS" ] || pruefe index.html index.html
for f in "${DATEIEN[@]}"; do
  # bugreport.php wird auf dem Server ausgeführt, also nur prüfen, dass es
  # antwortet und POST verlangt. Im Probelauf ist es eine Datei wie jede andere.
  if [ "$f" = bugreport.php ] && [ -z "$PROBE" ]; then
    C="$(curl -s -o /dev/null -w '%{http_code}' "$ADRESSE/bugreport.php")"
    [ "$C" = 405 ] || { echo "bugreport.php antwortet mit $C statt 405 – prüfen!" >&2; exit 1; }
    echo "bugreport.php: antwortet mit 405 (verlangt POST)"
    continue
  fi
  pruefe "$f" "$f"
done
# .htaccess liefert Apache nicht aus; nur im Probelauf aus dem Ordner prüfbar.
if [ -n "$PROBE" ] && [ -z "$BASIS" ]; then pruefe .htaccess .htaccess; fi

# --- Was sonst noch auf dem Server liegt -----------------------------------------
# Das Skript löscht nichts. Was im Zielordner liegt und nicht zu diesem Stand
# gehört (etwa raeume.html nach dem Rückweg auf einen alten Stand), wird genannt.
UEBRIG=()
if LISTE="$(lftp_lauf "cls -1 -a -B -F \"$ZIELORDNER\"" 2>/dev/null)"; then
  while IFS= read -r n; do
    case "$n" in ""|*/) continue ;; esac        # Ordner (auch . und ..) zählen nicht
    n="${n##*/}"; n="${n%[*@|=]}"               # Pfad und Kennzeichen von -F abstreifen
    case "$n" in .htaccess|index.html) continue ;; esac
    schon_dabei "$n" || UEBRIG+=("$n")
  done < <(printf '%s\n' "$LISTE")
  if [ "${#UEBRIG[@]}" -gt 0 ]; then
    echo "Bleibt auf dem Server liegen, gehört aber nicht zum Stand $STAND: ${UEBRIG[*]}"
    echo "  Nichts davon wird gelöscht. Seiten darunter bleiben direkt aufrufbar und laden dann die Skripte dieses Stands."
  else
    echo "Auf dem Server liegt nichts, was nicht zum Stand $STAND gehört."
  fi
else
  echo "Zielordner ließ sich nicht auflisten. Dateien, die nicht zum Stand $STAND gehören, bleiben auf dem Server liegen (das Skript löscht nichts)."
fi

if [ -n "$PROBE" ]; then
  echo "Probelauf fertig: $PROBE (Stand $STAND, $GEPRUEFT Abrufe per Hash geprüft${PROBE_URL:+, über $PROBE_URL}). Nichts wurde auf den Server geladen."
else
  echo "Fertig: $ADRESSE (Stand $STAND, $GEPRUEFT Abrufe per Hash geprüft, Cache-Header ok)"
fi
