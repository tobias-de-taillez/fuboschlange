#!/usr/bin/env bash
# Erste Auswertung einer Aufnahme mit echtem Gyro (?karte=1&imu=1, Doku 12.8): traegt die Gyro-Bruecke am echten Gyro?
#  1. T1 auf der Aufnahme mit Gyro-Bruecke und gedaempfter Vorhersage: Bericht mit der Zeile "IMU" (Rate, Luecken, Zuordnung,
#     Zeitversatz, Rest gegen ARCore, Schnitte mit Gyro-Bruecke).
#  2. Pruefstand (simulierter Bruch, raumskizze-pruefstand.mjs) mit dem ECHTEN Gyro aus imu.jsonl: Grundlinie gegen
#     Gyro-Bruecke + Vorhersage, alle Fenster und saubere (--nurRef). Am Pruefstand der Nacht war der Gyro nachgebildet
#     (Obergrenze); erst diese Zahlen zeigen, ob die Bruecke live geschaltet werden kann.
#
#   scripts/raumskizze-gyro-pruefen.sh aufnahme.tar protokoll.json [H in m, sonst aus dem Protokoll] [ausgabeordner]
#
# Liest nur; schreibt in den Ausgabeordner (Vorgabe: ein neuer Ordner unter $TMPDIR). Keine Daten ins Repo.
set -euo pipefail
cd "$(dirname "$0")/.."
NODE="${NODE:-node}"
[ $# -ge 2 ] || { echo "Aufruf: scripts/raumskizze-gyro-pruefen.sh aufnahme.tar protokoll.json [H] [ausgabeordner]" >&2; exit 1; }
TAR="$1"; PROT="$2"; H="${3:-}"; AUS="${4:-$(mktemp -d "${TMPDIR:-/tmp}/gyro-pruefen-XXXX")}"
[ -f "$TAR" ] && [ -f "$PROT" ] || { echo "Aufnahme oder Protokoll fehlt." >&2; exit 1; }
tar tf "$TAR" | grep -q 'imu.jsonl' || { echo "Die Aufnahme hat kein imu.jsonl (mit ?karte=1&imu=1 aufnehmen)." >&2; exit 1; }
mkdir -p "$AUS"
HARG=(); [ -n "$H" ] && HARG=(--H "$H")
K='--quelle erfassungen --ohne tiefe,ebenen'
GY='{"schnitt":{"gyroBruecke":true,"vorhersage":"gedaempft"}}'

echo "== 1. T1 mit Gyro-Bruecke (Bericht: $AUS/t1-gyro/bericht.txt) und ohne (t1-basis)"
"$NODE" raumskizze-karte.mjs "$TAR" --protokoll "$PROT" ${HARG[@]+"${HARG[@]}"} --quelle erfassungen --ohne tiefe,ebenen --karte "$GY" --aus "$AUS/t1-gyro" > "$AUS/t1-gyro.txt" 2>&1 || true
"$NODE" raumskizze-karte.mjs "$TAR" --protokoll "$PROT" ${HARG[@]+"${HARG[@]}"} --quelle erfassungen --ohne tiefe,ebenen --aus "$AUS/t1-basis" > "$AUS/t1-basis.txt" 2>&1 || true
grep -E '^IMU|^Kern|^Export' "$AUS/t1-gyro.txt" || echo "(keine IMU-Zeile: siehe $AUS/t1-gyro.txt)"
# Ende zu Ende gegen die Wahrheit (T1 nimmt sie, wenn wahrheit-hesterkamp-wohnkueche-*.json im Repo liegt; nur in der Wohnkueche sinnvoll,
# die Passung ist dort oft mehrdeutig): Aussenring und gehobene Beob, ohne und mit Gyro
for v in basis gyro; do echo "  T1 $v: $(grep -E 'Außenring' "$AUS/t1-$v.txt" | grep -oE 'A [0-9.]+/[0-9.]+ m² \([^)]*\) · IoU [0-9.]+' | head -1) | $(grep -E 'Beob gehoben' "$AUS/t1-$v.txt" | grep -oE 'Median [0-9.]+ cm, <10 cm [0-9]+ %' | head -1)"; done

echo "== 2. Pruefstand mit echtem Gyro"
for v in basis gyro; do for art in alle sauber; do
  T1="$K"; [ "$v" = gyro ] && T1="$K --karte $GY"
  ZUS=(); [ "$art" = sauber ] && ZUS=(--nurRef)
  "$NODE" raumskizze-pruefstand.mjs --aufnahme "neu=$TAR,$PROT" ${HARG[@]+"${HARG[@]}"} --rand 1.5 --minErf 4 --abstand 5 --n 10 ${ZUS[@]+"${ZUS[@]}"} \
    --t1 "$T1" --aus "$AUS/pruef-$v-$art" > "$AUS/pruef-$v-$art.log" 2>&1 || true
  echo "$v / $art: $(grep -E 'Fenster \(A in' "$AUS/pruef-$v-$art.log" | head -1)"
done; done
echo "Ausgaben: $AUS"
