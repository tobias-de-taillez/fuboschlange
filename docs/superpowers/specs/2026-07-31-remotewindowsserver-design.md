# remoteWindowsServer Bridge – Design

## Ziel

Die Pi-Session darf auf einem Remote-PC laufen, während die lokale Pi-Installation auf diesem Mac weiterhin die vorhandene `pi-speech`-TTS-Pipeline und Audioausgabe verwendet. Der Remote-PC sendet nach jeder vollständig abgeschlossenen Assistant-Antwort nur vorlesbare Textteile über das Tailscale-Netz an den lokalen Mac.

## Rollenmodell

Die Extension `remoteWindowsServer` wird auf beiden Rechnern installiert und über eine globale Konfigurationsdatei eindeutig konfiguriert:

- `role: "remote"`: nimmt am Remote-Pi die finale Antwort entgegen, ergänzt die Sprach-Prompt-Regeln und überträgt die vorbereiteten Speech-Chunks.
- `role: "local"`: stellt einen HTTP-Empfänger bereit und übergibt authentifizierte Chunks an die bestehende lokale `pi-speech`-Queue.

Die Rolle wird nicht automatisch aus der IP abgeleitet. Das verhindert Fehlkonfigurationen bei wechselnden Netzwerkadressen.

## Konfiguration

Remote-PC (`~/.pi/agent/remoteWindowsServer.json`):

```json
{
  "role": "remote",
  "localUrl": "http://100.80.187.52:8765",
  "voice": "german",
  "sharedSecret": "..."
}
```

Lokaler Mac:

```json
{
  "role": "local",
  "listenHost": "100.80.187.52",
  "listenPort": 8765,
  "allowedRemoteIp": "100.87.111.111",
  "sharedSecret": "..."
}
```

Die Konfigurationsdatei wird atomar geschrieben und mit restriktiven Dateirechten angelegt. Das Secret wird nie in Statusmeldungen oder Fehlermeldungen ausgegeben.

## Remote-Datenfluss

1. Bei `before_agent_start` prüft die Extension die Rolle und aktiviert im Remote-Modus dieselben Sprachregeln wie `pi-speech`.
2. Diese Regeln verlangen natürliche, vorlesefreundliche Sätze, kurze Absätze und möglichst wenig ungeeignete Markdown-Struktur. Die gewählte Stimme bestimmt die Sprache.
3. Bei `agent_settled` wird ausschließlich die finale Assistant-Antwort verwendet.
4. `prepareSpeech()` zerlegt den Text in sprechbare Chunks.
5. Die vollständige geordnete Chunk-Liste wird mit Session-ID und Message-ID in einem authentifizierten Request übertragen.
6. Der gesamte Request wird erst nach erfolgreicher Bestätigung als zugestellt betrachtet. Temporäre Netzwerkfehler werden begrenzt wiederholt; bei endgültigem Fehler bleibt die Pi-Antwort erfolgreich und die Bridge meldet den Fehler sichtbar.

Es wird keine Streaming-Zwischenantwort übertragen. Tool-Ausgaben, Thinking und abgebrochene Antworten werden nicht gesprochen.

## Lokaler Datenfluss

Der lokale Modus startet einen HTTP-Server auf `100.80.187.52:8765`. Der Server:

- akzeptiert nur Requests vom konfigurierten Remote-Adresseintrag `100.87.111.111`;
- authentifiziert jeden Request mit HMAC-SHA256 über das Shared Secret und einen kanonischen Request-String;
- validiert Session-ID, Message-ID, Stimme, Chunk-Liste und Chunk-Größen;
- dedupliziert bereits bestätigte `(sessionId, messageEntryId)`-Kombinationen;
- übergibt die vollständige Chunk-Liste als einen Job an die vorhandene `pi-speech`-Queue;
- antwortet erst nach erfolgreicher Queue-Übergabe mit einer Bestätigung.

Die lokale Extension erzeugt selbst kein alternatives Audio-Backend. Dadurch bleibt die bisherige lokale Piper/GLaDOS-Konfiguration unverändert.

## HTTP-Schnittstelle

- `GET /health`: lokaler Bereitschaftsstatus ohne Secret- oder Konfigurationsdetails.
- `POST /speech`: authentifizierter Speech-Chunk.
- `POST /cancel`: ist in der ersten Version nicht erforderlich und bleibt einer späteren Erweiterung vorbehalten.

Der Request enthält mindestens:

```json
{
  "protocol": 1,
  "sessionId": "...",
  "messageEntryId": "...",
  "voice": "german",
  "chunks": ["...", "..."]
}
```

Die bestehende lokale Queue bleibt die einzige Stelle, die FIFO, Worker-Lock, Nachrichtendeduplizierung und Audioausgabe kontrolliert.

## Commands und Status

Die Extension stellt mindestens bereit:

- `/remote status`
- `/remote on`
- `/remote off`

Der Status zeigt Rolle, Ziel/Listener, Erreichbarkeit, letzte Übertragung und Fehlerzustand, aber niemals das Shared Secret. Im Remote-Modus bedeutet `on/off`, ob Übertragungen erzeugt werden; im Local-Modus bedeutet es, ob eingehende Übertragungen angenommen werden.

## Gemeinsame Sprachlogik

`languageInstruction()` und `prepareSpeech()` sollen nicht dauerhaft doppelt implementiert werden. In einem fokussierten zweiten Schritt werden die gemeinsam benötigten Teile in ein kleines, von `pi-speech` und `remoteWindowsServer` importierbares Modul verschoben. Falls eine gemeinsame Installation auf Windows zunächst nicht praktikabel ist, enthält die Bridge vorübergehend eine identische, getestete Kopie der Sprachregeln.

## Fehlerbehandlung

- Nicht erreichbarer lokaler Host: begrenzte Retries, danach sichtbare Warnung; die Assistant-Antwort wird nicht verworfen.
- Ungültige HMAC-Authentifizierung oder fremde Quell-IP: HTTP 401/403, keine Queue-Änderung.
- Ungültige Payload: HTTP 400, keine Queue-Änderung.
- Doppelte Payload: idempotente positive Bestätigung ohne erneute Sprachausgabe.
- Lokale Speech-Abhängigkeiten defekt: `/remote status` meldet den Fehler; die Bridge bleibt diagnostizierbar.
- Shutdown beendet HTTP-Server, Watcher und offene Requests sauber.

## Tests

Automatisierte Tests decken ab:

1. Rollen- und Konfigurationsvalidierung.
2. Sprach-Prompt-Injektion nur im Remote-Modus.
3. Verarbeitung erst bei `agent_settled`.
4. Chunking und Sequenzreihenfolge.
5. Authentifizierung und IP-Allowlist.
6. Payload-Validierung und Größenlimits.
7. Deduplizierung und FIFO-Queue-Übergabe.
8. Retry/Timeout-Verhalten.
9. Shutdown und Statusdiagnostik.

Ein echter Tailscale-/Audio-Test bleibt ein bewusst separat auszuführender Integrationstest.

## Nicht im Umfang

- Audio-Streaming zurück zum Remote-PC.
- Ausführung von TTS auf dem Remote-PC.
- Vollständige Antwort- oder Session-Synchronisation.
- Öffnung des Ports außerhalb des Tailscale-Interfaces.
