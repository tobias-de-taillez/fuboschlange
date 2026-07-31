# pxpipe hinter Claude Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Token-Spar-Proxy `pxpipe-proxy` dauerhaft vor alle Claude-Code-Sessions (CLI + Desktop-App) legen — und ihn jederzeit in unter 2 Minuten rückstandslos wieder entfernen können.

**Architecture:** `pxpipe-proxy` läuft als launchd-LaunchAgent auf `127.0.0.1:47821` und rendert dicken Text-Kontext (System-Prompt, Tool-Docs, ältere History) vor dem Weiterleiten an `api.anthropic.com` in PNGs. Claude Code wird über den `env`-Block in `~/.claude/settings.json` (`ANTHROPIC_BASE_URL`) auf den Proxy gezeigt — dadurch gilt es für alle Sessions (Terminal und Desktop-App), ohne Shell-Konfiguration anzufassen. Die Claude-Desktop-**Chat**-App ist technisch nicht anbindbar (internes claude.ai-Protokoll, kein Base-URL-Override) und bleibt unberührt.

**Tech Stack:** `pxpipe-proxy@0.11.1` (npm, MIT), Node v26 (`/opt/homebrew`), launchd (macOS LaunchAgent), Claude Code 2.1.193.

## Global Constraints

- **Genau vier Berührpunkte am System, sonst nichts:**
  1. Key `env.ANTHROPIC_BASE_URL` in `~/.claude/settings.json`
  2. Datei `~/Library/LaunchAgents/com.pxpipe.proxy.plist`
  3. npm-Global-Paket `pxpipe-proxy`
  4. Datenordner `~/.pxpipe/` (Logs + Events, legt der Proxy selbst an)
- **Keine** Änderungen an `.zshrc`/Shell-Profil, Keychain, Auth/Login, App-Bundles oder Systemeinstellungen.
- Version fest gepinnt auf `0.11.1`. Updates nur bewusst per `npm install -g pxpipe-proxy@<neu>`.
- Nach jedem Task ist das System in einem funktionierenden Zustand; Abbruch jederzeit möglich.
- Task 2 ist ein **Gate**: Schlägt der Subscription/OAuth-Pfad durch den Proxy fehl, wird abgebrochen — bis dahin ist nichts persistiert.
- settings.json-Änderungen ausschließlich key-basiert per `python3`-JSON-Roundtrip (kein Text-Patchen, kein jq nötig), damit Ein- und Ausbau unabhängig davon funktionieren, was sonst in der Datei steht.
- Die Tasks ändern nichts im Zaene-Repo; es gibt daher keine Commit-Schritte in den Tasks. Einzige Repo-Änderung ist dieses Plan-Dokument selbst.
- Uhrzeit-/Betriebssystem-Kontext: macOS, User `tdetaillez` (uid 501), `claude` unter `/opt/homebrew/bin/claude`.

---

### Task 1: Vorflug-Checks und Backup

**Files:**
- Create: `~/.claude/settings.json.pre-pxpipe.bak` (Kopie, nur Notfall-Referenz)
- Modify: keine

**Interfaces:**
- Consumes: nichts
- Produces: verifizierte Ausgangslage (Port frei, kein bestehendes `ANTHROPIC_BASE_URL`, Backup vorhanden) — Voraussetzung für alle Folge-Tasks

- [ ] **Step 1: Ausgangslage prüfen**

```bash
lsof -nP -i :47821; echo "---"; env | grep -i anthropic; echo "---"; python3 -c "import json,pathlib; d=json.loads((pathlib.Path.home()/'.claude/settings.json').read_text()); print(json.dumps(d.get('env'), indent=2))"
```

Erwartet: `lsof` leer (Port frei), `env | grep` leer (keine Shell-weite Base-URL), letzter Befehl druckt `null` (kein `env`-Block in settings.json). Falls irgendwo etwas gesetzt ist: **stopp**, erst Konflikt klären.

- [ ] **Step 2: Backup der settings.json anlegen**

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.pre-pxpipe.bak && ls -la ~/.claude/settings.json.pre-pxpipe.bak
```

Erwartet: Datei existiert, Größe > 0. Hinweis: Das Backup ist Notfall-Referenz. Der reguläre Ausbau (Task 7) entfernt nur den einen Key und kopiert **nicht** das Backup zurück (würde spätere Settings-Änderungen überschreiben).

- [ ] **Step 3: Werkzeuge prüfen**

```bash
node --version && npm --version && which claude && claude --version
```

Erwartet: `v26.x`, npm-Version, `/opt/homebrew/bin/claude`, `2.1.x (Claude Code)`.

---

### Task 2: Wegwerf-Test — GATE für Subscription/OAuth

Nichts wird persistiert. Ziel: Beweis, dass der Proxy mit dem Subscription-Login (OAuth, kein API-Key) funktioniert. Das ist die eine offene Unbekannte — das pxpipe-README dokumentiert nur den API-Key-Pfad explizit.

**Files:**
- Create: `~/pxpipe-smoketest.log` (temporär, wird in Step 5 gelöscht)
- Modify: keine

**Interfaces:**
- Consumes: freie Portlage aus Task 1
- Produces: Go/No-Go-Entscheidung. Bei Go: nachgewiesener Befehl `ANTHROPIC_BASE_URL=http://127.0.0.1:47821 claude -p …` funktioniert. Bei No-Go: Abbruch des Gesamtplans, System unverändert.

- [ ] **Step 1: Proxy temporär starten (Vordergrund-Prozess im Hintergrund der Shell)**

```bash
npx -y pxpipe-proxy@0.11.1 > ~/pxpipe-smoketest.log 2>&1 &
sleep 5 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:47821/
```

Erwartet: dreistelliger HTTP-Code (z. B. `404` oder `200`) — beweist: Proxy lauscht. `000` = Proxy läuft nicht → `cat ~/pxpipe-smoketest.log` lesen, abbrechen.

- [ ] **Step 2: Headless-Session durch den Proxy schicken**

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:47821 claude -p "Antworte mit genau einem Wort: OK"
```

Erwartet: Ausgabe enthält `OK`. Das beweist: OAuth-Auth wird durch den Proxy korrekt durchgereicht. Fehler (401, Verbindungsfehler, Hänger > 60 s) = **No-Go** → Step 4 (Aufräumen) ausführen, Plan abbrechen, Ergebnis dokumentieren.

- [ ] **Step 3: Kompression nachweisen**

```bash
tail -5 ~/.pxpipe/events.jsonl
```

Erwartet: JSON-Zeilen mit Event-Daten des eben gelaufenen Requests (Kompressions-/Token-Angaben). Datei fehlt oder leer = Proxy hat nichts verarbeitet → Ergebnis von Step 2 anzweifeln, Log lesen.

- [ ] **Step 4: Gegenprobe ohne Proxy (Regression ausschließen)**

```bash
claude -p "Antworte mit genau einem Wort: OK"
```

Erwartet: `OK` — normaler Pfad funktioniert weiterhin unverändert.

- [ ] **Step 5: Testumgebung restlos aufräumen**

```bash
pkill -f pxpipe-proxy; sleep 1; lsof -nP -i :47821; rm -f ~/pxpipe-smoketest.log
```

Erwartet: `lsof` leer. System jetzt exakt im Zustand von vor Task 2 (bis auf `~/.pxpipe/` mit Test-Events — unschädlich, wird bei Ausbau entfernt).

---

### Task 3: Feste Installation — npm global + LaunchAgent

**Files:**
- Create: `~/Library/LaunchAgents/com.pxpipe.proxy.plist`
- Create (durch npm): `/opt/homebrew/bin/pxpipe-proxy` + `/opt/homebrew/lib/node_modules/pxpipe-proxy/`

**Interfaces:**
- Consumes: Go aus Task 2
- Produces: dauerhaft laufender Proxy auf `127.0.0.1:47821`, überlebt Reboot (RunAtLoad) und Crashes (KeepAlive). Task 4 verlässt sich darauf.

- [ ] **Step 1: Global installieren (gepinnt)**

```bash
npm install -g pxpipe-proxy@0.11.1 && which pxpipe
```

Erwartet: `/opt/homebrew/bin/pxpipe`. (Das Paket heißt `pxpipe-proxy`, sein Binary aber `pxpipe` — bei Task-3-Ausführung entdeckt, Plan korrigiert.)

- [ ] **Step 2: LaunchAgent-Plist schreiben**

Datei `~/Library/LaunchAgents/com.pxpipe.proxy.plist` mit exakt diesem Inhalt anlegen:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pxpipe.proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/pxpipe</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/tdetaillez/.pxpipe/proxy.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/tdetaillez/.pxpipe/proxy.err.log</string>
</dict>
</plist>
```

(`PATH` ist nötig, weil das npm-Bin-Skript per `#!/usr/bin/env node` startet und launchd sonst kein `node` findet.)

- [ ] **Step 3: Laden und Health-Check**

```bash
mkdir -p ~/.pxpipe && launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.pxpipe.proxy.plist && sleep 3 && launchctl print gui/501/com.pxpipe.proxy | grep -E "state|pid" && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:47821/
```

Erwartet: `state = running`, eine PID, dreistelliger HTTP-Code. Bei Fehler: `cat ~/.pxpipe/proxy.err.log`.

- [ ] **Step 4: Crash-Recovery beweisen (KeepAlive-Test)**

```bash
pkill -f '/opt/homebrew/bin/pxpipe' && sleep 5 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:47821/
```

Erwartet: wieder dreistelliger Code — launchd hat den Proxy automatisch neu gestartet. Das ist die Absicherung gegen „Proxy tot → alle Claude-Sessions tot".

---

### Task 4: Claude Code auf den Proxy zeigen (settings.json)

**Files:**
- Modify: `~/.claude/settings.json` (nur Key `env.ANTHROPIC_BASE_URL` hinzufügen)

**Interfaces:**
- Consumes: laufender LaunchAgent aus Task 3
- Produces: Key `env.ANTHROPIC_BASE_URL = "http://127.0.0.1:47821"` — ab jetzt laufen **neue** Claude-Code-Sessions (CLI + Desktop-App) durch den Proxy. Task 7 entfernt exakt diesen Key wieder.

- [ ] **Step 1: Key key-basiert eintragen**

```bash
python3 - <<'EOF'
import json, pathlib
p = pathlib.Path.home() / '.claude/settings.json'
d = json.loads(p.read_text())
d.setdefault('env', {})['ANTHROPIC_BASE_URL'] = 'http://127.0.0.1:47821'
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
print(json.dumps(d['env'], indent=2))
EOF
```

Erwartet: Ausgabe `{ "ANTHROPIC_BASE_URL": "http://127.0.0.1:47821" }`.

- [ ] **Step 2: Datei-Integrität prüfen (Rest der Settings unangetastet)**

```bash
python3 -c "import json,pathlib; d=json.loads((pathlib.Path.home()/'.claude/settings.json').read_text()); print('model:', d.get('model')); print('hooks intakt:', sorted(d.get('hooks',{}).keys()))"
```

Erwartet: `model: opus` und `hooks intakt: ['PreToolUse', 'SessionStart', 'UserPromptSubmit']` — beweist: nur der env-Key kam dazu, nichts anderes verändert.

- [ ] **Step 3: Wirksamkeit in frischer Session prüfen**

```bash
wc -l < ~/.pxpipe/events.jsonl; claude -p "Antworte mit genau einem Wort: OK"; wc -l < ~/.pxpipe/events.jsonl
```

Erwartet: `OK`, und der zweite `wc -l`-Wert ist größer als der erste — die Session lief ohne manuelle Env-Var durch den Proxy (settings.json wirkt).

---

### Task 5: End-to-End-Verifikation Desktop-App

**Files:** keine Änderungen

**Interfaces:**
- Consumes: Task 3 + Task 4 abgeschlossen
- Produces: Nachweis, dass auch Desktop-App-Sessions durch den Proxy laufen

- [ ] **Step 1: Desktop-App neu starten**

Manuell: Claude-Code-Desktop-App komplett beenden (⌘Q) und neu öffnen. Laufende Sessions haben die alte Umgebung geerbt; nur neue Prozesse lesen den neuen `env`-Block.

- [ ] **Step 2: Neue Desktop-Session öffnen und Proxy-Traffic nachweisen**

In der neuen Desktop-Session eine beliebige kurze Frage stellen, danach im Terminal:

```bash
tail -3 ~/.pxpipe/events.jsonl
```

Erwartet: frische Events mit aktuellem Zeitstempel. Keine neuen Events = Desktop-Session läuft **nicht** durch den Proxy → prüfen, ob die App wirklich neu gestartet wurde.

- [ ] **Step 3: Qualitäts-Smoke für exakte Strings**

In derselben Desktop-Session früh einen exakten Wert nennen (z. B. Ausgabe von `git log --oneline -1` einfügen), dann die Session mit mehreren langen Datei-Reads füllen (History wächst, ältere Turns werden geimaged), dann nach dem exakten Commit-Hash vom Anfang fragen und mit `git log` vergleichen.

Erwartet: Hash stimmt Zeichen für Zeichen. Abweichung = die dokumentierte Confabulation-Schwäche schlägt bei uns real zu → Befund notieren, Ausbau (Task 7) erwägen.

---

### Task 6: Probezeit und Messung

**Files:** keine Änderungen

**Interfaces:**
- Consumes: laufendes Gesamtsystem
- Produces: Entscheidung „bleibt drin" oder „Ausbau per Task 7", plus Ersparnis-Zahlen

- [ ] **Step 1: 2–3 Arbeitstage normal arbeiten**

Abbruchkriterien während der Probezeit (jedes einzelne reicht für sofortigen Ausbau per Task 7):
- Falsch erinnerte exakte Werte (Git-Hashes, IDs, Pfade, Zahlenwerte aus früher Session-History)
- Spürbar erhöhte Latenz bei großen Requests
- Session-Verbindungsfehler, die nach `launchctl print gui/501/com.pxpipe.proxy` auf den Proxy zurückfallen

- [ ] **Step 2: Ersparnis beziffern**

```bash
python3 - <<'EOF'
import json, pathlib
lines = [json.loads(l) for l in (pathlib.Path.home()/'.pxpipe/events.jsonl').read_text().splitlines() if l.strip()]
print(f"{len(lines)} Events geloggt. Felder des letzten Events:")
print(json.dumps(lines[-1], indent=2)[:2000])
EOF
```

Erwartet: Event-Felder mit Vorher/Nachher-Token-Angaben (genaue Feldnamen dem tatsächlichen Log entnehmen). Daraus Ersparnis in % berechnen und mit dem 59–70-%-Claim des READMEs vergleichen. Bei Subscription heißt Ersparnis: gestreckte Rate-Limits, nicht gesenkte Rechnung.

---

### Task 7: Ausbau-Runbook (nur bei Bedarf ausführen — jederzeit, < 2 min)

**Files:**
- Modify: `~/.claude/settings.json` (Key entfernen)
- Delete: `~/Library/LaunchAgents/com.pxpipe.proxy.plist`, npm-Paket, optional `~/.pxpipe/`, Backup-Datei

**Interfaces:**
- Consumes: beliebiger Zustand nach Task 4 (funktioniert auch, wenn nur Teile installiert sind — jeder Step prüft sein eigenes Ziel)
- Produces: System exakt im Ausgangszustand

**Reihenfolge ist wichtig:** erst Claude Code vom Proxy wegdrehen (Step 1), dann Proxy stoppen (Step 3). Umgekehrt zeigen neue Sessions auf einen toten Port und schlagen fehl, bis der Key entfernt ist.

- [ ] **Step 1: env-Key aus settings.json entfernen (key-basiert, anker-unabhängig)**

```bash
python3 - <<'EOF'
import json, pathlib
p = pathlib.Path.home() / '.claude/settings.json'
d = json.loads(p.read_text())
d.get('env', {}).pop('ANTHROPIC_BASE_URL', None)
if d.get('env') == {}:
    d.pop('env', None)
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
print('env jetzt:', d.get('env'))
EOF
```

Erwartet: `env jetzt: None` (bzw. der Rest-Inhalt, falls inzwischen andere env-Vars dazukamen — die bleiben unangetastet).

- [ ] **Step 2: Laufende Sessions neu starten**

Manuell: Desktop-App ⌘Q + neu öffnen, offene Terminal-`claude`-Sessions beenden. (Laufende Prozesse behalten die geerbte Base-URL bis zum Neustart.)

- [ ] **Step 3: LaunchAgent stoppen und entfernen**

```bash
launchctl bootout gui/501/com.pxpipe.proxy; rm -f ~/Library/LaunchAgents/com.pxpipe.proxy.plist; sleep 1; lsof -nP -i :47821; echo "leer = Proxy weg"
```

Erwartet: `lsof` leer.

- [ ] **Step 4: npm-Paket entfernen**

```bash
npm uninstall -g pxpipe-proxy && which pxpipe; echo "kein Pfad = entfernt"
```

Erwartet: `which` findet nichts mehr.

- [ ] **Step 5: Daten und Backup entfernen (optional — Events vorher sichern, falls Zahlen behalten werden sollen)**

```bash
rm -rf ~/.pxpipe && rm -f ~/.claude/settings.json.pre-pxpipe.bak
```

- [ ] **Step 6: Endzustand verifizieren**

```bash
claude -p "Antworte mit genau einem Wort: OK"; echo "---"; python3 -c "import json,pathlib; d=json.loads((pathlib.Path.home()/'.claude/settings.json').read_text()); print('env:', d.get('env')); print('model:', d.get('model'))"
```

Erwartet: `OK` über den normalen Direktpfad, `env: None`, `model: opus`. System wie vor Task 1.

---

## Failure-Modes (Referenz)

| Symptom | Ursache | Fix |
|---|---|---|
| Neue Sessions: Verbindungsfehler | Proxy down trotz KeepAlive (z. B. Port belegt, Crash-Loop) | `cat ~/.pxpipe/proxy.err.log`; Notfall: Task 7 Step 1 (Key raus) → sofort wieder normal |
| Session hängt/langsam bei großen Requests | PNG-Encoding-Latenz (dokumentiert) | Beobachten; zu störend → Task 7 |
| Falsche exakte Werte aus alter History | Dokumentierte Silent-Confabulation (Fable 5: 13/15 bei 12-Zeichen-Hex) | Task 7. Kein Workaround im Proxy-Betrieb |
| `launchctl bootstrap` schlägt fehl: „already bootstrapped" | Agent lief schon | `launchctl bootout gui/501/com.pxpipe.proxy` und erneut bootstrappen |
| Nach macOS-/Node-Update: Proxy startet nicht | Homebrew-Node-Pfad geändert | `which node` prüfen, `PATH` im Plist anpassen, `bootout` + `bootstrap` |
