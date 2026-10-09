# Handoff: Hetzner-Webhosting `irazari` – weitere Webseiten hosten

Stand: 2026-10-07. Enthält keine Passwörter. Passwörter stehen nur in konsoleH (Logindaten → Ansehen/Kopieren) und in den GitHub-Secrets der Repos.

## Eckdaten

| | |
|---|---|
| Verwaltung | konsoleH: https://konsoleh.hetzner.com (Login durch den Nutzer, Brave) |
| Paket | Webhosting S, Hosting-Name `irazari` (intern `ebrl.your-vhost.de`), 10 GB, 1 Datenbank |
| Server | `www795.your-server.de` · IPv4 `167.235.125.76` · IPv6 `2a01:4f8:1061:2275::2` |
| Domain | `irazari-te.ch`, registriert am 2026-10-07 über Hetzner |
| Nameserver | `ns1.your-server.de`, `ns.second-ns.com`, `ns3.second-ns.de` |
| DNS-Zone | Hetzner Console, Projekt 16306015, Zone 1632282 (aus konsoleH: Domain → DNS-Verwaltung → Bearbeiten). konsoleH darf die Zone automatisch pflegen. |
| AV-Vertrag | abgeschlossen am 2026-10-07 (Datenarten: Protokolldaten, Kommunikationsdaten; Betroffene: Besucher und Nutzer der Website) |

## Zugang per FTP

- **Hauptbenutzer `ebrh7y`** funktioniert. Er startet im Home-Verzeichnis, darunter liegen `public_html/` und `www_logs/`.
- FTPS auf Port 21, SFTP auf Port 22.
- Als Host immer `www795.your-server.de` angeben. Das Zertifikat lautet auf `*.your-server.de`, mit der eigenen Domain schlägt die Prüfung fehl.
- Aus dem Heimnetz ist IPv6 nicht erreichbar („No route to host“). Deshalb in lftp `set dns:order inet` setzen, sonst hängt die Verbindung.
- Der Zusatzbenutzer `ebrh7y_0` (Startverzeichnis `public_html`) lässt sich nicht einloggen (`530 Login incorrect`), obwohl das Passwort nachweislich stimmt. Ungeklärt. Sein Passwort stand außerdem im Chat. **Löschen**, er wird nicht genutzt.

Test (Passwort aus der Zwischenablage, zuvor in konsoleH kopiert):

```bash
LFTP_PASSWORD="$(pbpaste)" lftp --env-password -u ebrh7y www795.your-server.de -e "set dns:order inet; set net:timeout 15; set net:max-retries 1; set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true; ls public_html; quit"
```

## Verzeichnisse und Seiten

| URL | Verzeichnis | Inhalt |
|---|---|---|
| `irazari-te.ch` | `public_html/` | noch ein alter tenfinger-Build vom ersten Deploy, sonst nichts geplant |
| `tenfinger.irazari-te.ch` | `public_html/tenfinger/` | Tippo/tenfinger, Deploy aus `tobias-de-taillez/tenfinger` |

Faustregel: jede Seite eine Subdomain mit eigenem Unterverzeichnis `public_html/<name>/`.

## Neue Webseite hinzufügen

1. **Subdomain anlegen:** konsoleH → `irazari-te.ch` auswählen → Einstellungen → Subdomains.
   - Subdomainname: `<name>`. „www anlegen“ aus.
   - Zielverzeichnis: Das Präfix `/public_html` ist fest vorgegeben, ins Feld kommt nur `/<name>`.
   - Hetzner trägt den DNS-Eintrag mit Verzögerung ein. Prüfen mit `dig +short A <name>.irazari-te.ch`, Ergebnis muss `167.235.125.76` sein.
2. **SSL:** erst wenn die Subdomain auflöst. Sind DNS-Einträge sehr frisch, sperrt konsoleH kostenlose Zertifikate vorübergehend, dann später erneut versuchen.
   - SSL Manager → Neues Zertifikat → Let's Encrypt → Subdomain im Auswahlfeld wählen → Beantragen.
   - Achtung: Beim Wählen der Domain setzt konsoleH den Haken „Eintrag für www-Subdomain“ selbst. Ein zusätzlicher Klick nimmt ihn wieder weg.
   - Danach in der Liste „SSL-Accounts“ das Zertifikat auswählen und auf das Aktualisieren-Symbol klicken (installieren). Dann die HTTPS-Weiterleitung auf „Ein“ stellen.
   - Prüfen: `echo | openssl s_client -connect <host>:443 -servername <host> 2>/dev/null | openssl x509 -noout -issuer -ext subjectAltName`
3. **Deploy:** Muster aus `tobias-de-taillez/tenfinger`, Datei `.github/workflows/ci-deploy.yml`. Der Build wird per `lftp mirror --reverse --delete` über FTPS hochgeladen, mit Zertifikatsprüfung. Repo-Secrets:

   | Secret | Wert |
   |---|---|
   | `DEPLOY_HOST` | `www795.your-server.de` |
   | `DEPLOY_USER` | `ebrh7y` |
   | `DEPLOY_PASSWORD` | Passwort des Hauptbenutzers (konsoleH → Logindaten → FTP-Hauptbenutzer → Kopieren, dann `pbpaste \| gh secret set DEPLOY_PASSWORD --repo <repo>`) |
   | `DEPLOY_PATH` | `public_html/<name>` |

   Secrets gelten pro Repo. Ohne GitHub-Organisation lassen sie sich nicht zentral teilen, also in jedem Repo neu setzen.

4. **Apache-Header:** Pro Seite über eine eigene `.htaccess` im Build. Vorlage ist `public/.htaccess` im tenfinger-Repo (CSP, Caching, `no-cache` für Service Worker und Manifest).

## Fallen

- **`mirror --delete` niemals auf `public_html/` selbst richten**, solange darunter Subdomain-Verzeichnisse liegen. Sonst löscht der Upload alle anderen Seiten. Ein Deploy für die Hauptdomain braucht dafür `--exclude`-Regeln für jedes Subdomain-Verzeichnis und für `.well-known/`.
- Der Ordner `.well-known/` dient der Let's-Encrypt-Validierung und muss beim Upload ausgeschlossen bleiben.
- Weblogs: IPs werden pseudonymisiert (IPv4 letztes Oktett zufällig). Laut konsoleH werden Weblogs standardmäßig **nie gelöscht**. Ändern unter Einstellungen → Accountwartung → Eigene Regeln. Bisher bewusst so gelassen.
- gh-CLI: Auf dem Mac sind zwei Accounts eingeloggt, aktiv ist `tobias-de-taillez`. `wargdronestdt` hat keinen Zugriff auf die Repos.

## Offen

- `irazari-te.ch`: Das Let's-Encrypt-Zertifikat deckt nur die Domain ohne `www.` ab. Eine zweite Beantragung mit www hat kein neues Zertifikat erzeugt. Wahrscheinlich das alte erst löschen und dann neu beantragen. HTTPS-Weiterleitung noch aus.
- `public_html/` aufräumen (alter tenfinger-Build) oder dort eine eigene Startseite deployen. Dabei die Falle oben beachten.
- Zusatzbenutzer `ebrh7y_0` löschen.
- Impressum und Datenschutzerklärung für die Domain.
