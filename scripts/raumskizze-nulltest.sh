#!/bin/bash
# Nulltest (Konzept 3.1 Punkt 1): T1 auf dem Flur (Aufnahme 31.10. 16:25, Karte mit Gyro-Bruecke wie live) gegen die Wahrheit,
# Kennzahlen gegen nulltest-baseline.json. Kein Eingriff darf auf einem gesunden Raum etwas aendern.
#
#   scripts/raumskizze-nulltest.sh                      pruefen
#   scripts/raumskizze-nulltest.sh --baseline-schreiben Baseline aus diesem Lauf neu schreiben (nur mit Begruendung)
#
# Exit 0 gruen, 1 Verschlechterung ueber Toleranz oder Pflichtwert verletzt, 2 Daten fehlen oder Eingabe geaendert.
# Daten (nicht im Repo): Aufnahme + Protokoll in $RAUMSKIZZE_DATEN (Vorgabe ~/Downloads), Wahrheit Flur als
# $NULLTEST_WAHRHEIT oder ./wahrheit-flur.json (untracked, wie die der Wohnkueche). Andere Pfade: NULLTEST_TAR, NULLTEST_PROTOKOLL.
set -euo pipefail
cd "$(dirname "$0")/.."

STEMPEL=2026-10-31T16-25-49-246Z
DATEN="${RAUMSKIZZE_DATEN:-$HOME/Downloads}"
TAR="${NULLTEST_TAR:-$DATEN/aufnahme-$STEMPEL-lauf0-video.tar}"
PROTOKOLL="${NULLTEST_PROTOKOLL:-$DATEN/raumskizze-protokoll-$STEMPEL.json}"
WAHRHEIT="${NULLTEST_WAHRHEIT:-}"
if [ -z "$WAHRHEIT" ]; then
  for f in ./wahrheit-flur.json "$DATEN/wahrheit-flur.json"; do
    if [ -f "$f" ]; then WAHRHEIT="$f"; break; fi
  done
fi

fehlt=0
for f in "$TAR" "$PROTOKOLL" "$WAHRHEIT"; do
  if [ -z "$f" ] || [ ! -f "$f" ]; then echo "Nulltest: Datei fehlt: ${f:-wahrheit-flur.json (NULLTEST_WAHRHEIT setzen)}" >&2; fehlt=1; fi
done
if [ "$fehlt" = 1 ]; then echo "Nulltest: Daten fehlen - nicht geprueft (Exit 2)" >&2; exit 2; fi

AUS="$(mktemp -d "${TMPDIR:-/tmp}/raumskizze-nulltest.XXXXXX")"
trap 'rm -rf "$AUS"' EXIT

# Bash-Array statt unquotierter Variable: Pfade und das JSON bleiben je ein Argument
T1=(node raumskizze-karte.mjs "$TAR" --protokoll "$PROTOKOLL" --wahrheit "$WAHRHEIT"
    --quelle erfassungen --ohne tiefe,ebenen
    --karte '{"schnitt":{"gyroBruecke":true,"vorhersage":"gedaempft"}}' --aus "$AUS")
"${T1[@]}" > "$AUS/t1.txt"

STAND="$(git rev-parse --short HEAD 2>/dev/null || echo unbekannt)"
BEFEHL="node raumskizze-karte.mjs <aufnahme.tar> --protokoll <protokoll.json> --wahrheit <wahrheit-flur.json> --quelle erfassungen --ohne tiefe,ebenen --karte '{\"schnitt\":{\"gyroBruecke\":true,\"vorhersage\":\"gedaempft\"}}'"
node raumskizze-nulltest.mjs --ergebnis "$AUS/ergebnis.json" --baseline nulltest-baseline.json \
  --tar "$TAR" --protokoll "$PROTOKOLL" --wahrheit "$WAHRHEIT" --stand "$STAND" --befehl "$BEFEHL" "$@"
