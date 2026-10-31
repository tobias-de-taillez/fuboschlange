#!/usr/bin/env bash
# Raumzuordnung einer Raumskizze-Aufnahme: T1 gegen BEIDE Wahrheiten (Flur, Wohnkueche) und die Passungs-Kennzahlen
# nebeneinander ausgeben. Ruft nur T1 (raumskizze-karte.mjs) auf, sonst nichts.
#
#   scripts/raumskizze-zuordnung.sh <aufnahme.tar> <protokoll.json> [ausgabeordner]
#
# Umgebung (alle optional):
#   RAUMSKIZZE_DIR   Ordner mit raumskizze-karte.mjs (Vorgabe: dieser Checkout, sonst das Haupt-Worktree des Repos)
#   WAHRHEIT_FLUR    Wahrheit Flur (Vorgabe: hesterkamp-flur-2026-10-31.json im T1-Ordner, sonst ~/Downloads)
#   WAHRHEIT_KUECHE  Wahrheit Wohnkueche (Vorgabe: wahrheit-hesterkamp-wohnkueche-2026-10-25.json im T1-Ordner, sonst ~/Downloads)
#   HOEHE            Hoehe in m (--H); ohne Angabe nimmt T1 sie aus dem Protokoll
#
# Lesehilfe (docs/superpowers/research/2026-10-31-messregister.md): Eine Zuordnung gilt nur, wenn die Passung
# EINDEUTIG ist (Mehrdeutigkeit >= 1,5), nicht gespiegelt und die Huelle zu den Wahrheitsmassen passt.
# Mehrdeutigkeit 1,00-1,11 heisst: die Passung ist ein Zufallstreffer, keine Aussage.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

# absolute Pfade: das Skript wechselt vor dem Aufruf in den T1-Ordner
absolut() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$PWD" "$1" ;; esac; }
TAR=$(absolut "$1"); PROT=$(absolut "$2"); AUS=
[ -n "${3:-}" ] && AUS=$(absolut "$3")
{ [ -e "$TAR" ] && [ -f "$PROT" ]; } || { echo "Aufnahme oder Protokoll nicht gefunden" >&2; exit 2; }

HIER=$(cd "$(dirname "$0")" && pwd)
if [ -n "${RAUMSKIZZE_DIR:-}" ]; then
  T1DIR=$RAUMSKIZZE_DIR
elif [ -f "$HIER/../raumskizze-karte.mjs" ]; then
  T1DIR=$(cd "$HIER/.." && pwd)
else
  # erster Eintrag von "git worktree list" ist das Haupt-Worktree
  T1DIR=$(git -C "$HIER" worktree list --porcelain | sed -n 's/^worktree //p' | head -1)
fi
[ -f "$T1DIR/raumskizze-karte.mjs" ] || { echo "raumskizze-karte.mjs nicht gefunden in $T1DIR (RAUMSKIZZE_DIR setzen)" >&2; exit 2; }

W_FLUR=${WAHRHEIT_FLUR:-}
if [ -z "$W_FLUR" ]; then
  for c in "$T1DIR/hesterkamp-flur-2026-10-31.json" "$HOME/Downloads/hesterkamp-flur-2026-10-31.json"; do
    if [ -f "$c" ]; then W_FLUR=$c; break; fi
  done
fi
W_KUECHE=${WAHRHEIT_KUECHE:-$T1DIR/wahrheit-hesterkamp-wohnkueche-2026-10-25.json}
[ -f "$W_KUECHE" ] || W_KUECHE=$HOME/Downloads/hesterkamp-wohnkueche-2026-10-25.json
[ -f "$W_FLUR" ] || { echo "Wahrheit Flur nicht gefunden (WAHRHEIT_FLUR setzen)" >&2; exit 2; }
[ -f "$W_KUECHE" ] || { echo "Wahrheit Wohnkueche nicht gefunden (WAHRHEIT_KUECHE setzen)" >&2; exit 2; }

ARG_H=()
[ -n "${HOEHE:-}" ] && ARG_H=(--H "$HOEHE")

rechnen() { # $1 Name, $2 Wahrheitsdatei
  local name=$1 wahr=$2 ziel=() aus
  [ -n "$AUS" ] && { mkdir -p "$AUS/$name"; ziel=(--aus "$AUS/$name"); }
  echo "--- gegen Wahrheit $name ($(basename "$wahr"))"
  # Gleiche Konfiguration wie der Referenzlauf (Messregister): Erfassungen am Fadenkreuz, Gyro-Bruecke, gedaempfte Vorhersage.
  # ${arr[@]+"${arr[@]}"}: ein leeres Array ist unter set -u in aelterem bash ein Fehler.
  aus=$(cd "$T1DIR" && node raumskizze-karte.mjs "$TAR" --protokoll "$PROT" --wahrheit "$wahr" \
    --quelle erfassungen --ohne tiefe,ebenen \
    --karte '{"schnitt":{"gyroBruecke":true,"vorhersage":"gedaempft"}}' \
    ${ARG_H[@]+"${ARG_H[@]}"} ${ziel[@]+"${ziel[@]}"} 2>&1) || { echo "$aus" | tail -5; return 0; }
  # Die T2-Zeile "Hoehe ... gegen Laser 2.42 m" bleibt weg: 2.416 ist dort der Vorgabewert hFest, keine Messung.
  echo "$aus" | grep -E '^Quelle|Passung aus beob|Außenring:|Wände: gefunden|Beob gehoben: ' \
    | sed -E 's/^ +/  /' | cut -c1-330 || true
  echo "$aus" | grep -q 'Passung aus beob' \
    || echo "  (keine Passung: Karte ohne brauchbare Hoehe? Mit HOEHE=<m> erneut versuchen, z. B. HOEHE=2.5)"
}

echo "== $(basename "$PROT")"
rechnen flur "$W_FLUR"
rechnen wohnkueche "$W_KUECHE"
