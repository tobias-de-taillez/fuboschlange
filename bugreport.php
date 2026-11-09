<?php
// Empfaenger fuer "Fehler / Wunsch melden" aus raumaufmass.html.
//
// Legt jede Meldung als JSON-Datei AUSSERHALB von public_html ab
// ($HOME/raumaufmass-bugreports, per Web nicht erreichbar). Abgeholt und
// dabei vom Server geloescht wird sie mit scripts/bugreports-abholen.sh.
// Optional eine inhaltsfreie Benachrichtigung per Mail: steht in
// <Ablage>/.benachrichtigung eine Adresse, geht dorthin nur "neue Meldung <id>"
// - kein Text, kein Bild, kein Zustand. Die Adresse liegt nur auf dem Server,
// nicht im (oeffentlichen) Repo.
//
// Lokal testbar:  MELDUNG_DIR=/tmp/x php -S localhost:8743

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const MAX_BYTES     = 15 * 1024 * 1024;   // eine Meldung
const MAX_BILD      = 8 * 1024 * 1024;    // davon das Bild (Base64)
const MAX_TEXT      = 20000;
const MAX_ABLAGE    = 300 * 1024 * 1024;  // alle noch nicht abgeholten zusammen
const MAX_DATEIEN   = 500;

function antwort(int $status, array $body): never {
  http_response_code($status);
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  header('Allow: POST');
  antwort(405, ['ok' => false, 'fehler' => 'Nur POST.']);
}

// Nur von der eigenen Seite: der Browser setzt Origin bei fetch-POST immer.
// Kein Schutz gegen Skripte, aber gegen fremde Seiten, die Besucher hier
// Meldungen absetzen lassen.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host   = $_SERVER['HTTP_HOST'] ?? '';
if ($origin === '' || parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '') !== $host) {
  antwort(403, ['ok' => false, 'fehler' => 'Fremde Herkunft.']);
}
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
  antwort(415, ['ok' => false, 'fehler' => 'Erwartet application/json.']);
}
$laenge = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($laenge <= 0 || $laenge > MAX_BYTES) {
  antwort(413, ['ok' => false, 'fehler' => 'Meldung zu groß (höchstens 15 MB).']);
}
$roh = file_get_contents('php://input', false, null, 0, MAX_BYTES + 1);
if ($roh === false || strlen($roh) > MAX_BYTES) {
  antwort(413, ['ok' => false, 'fehler' => 'Meldung zu groß (höchstens 15 MB).']);
}

try {
  $m = json_decode($roh, true, 512, JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
  antwort(400, ['ok' => false, 'fehler' => 'Kein gültiges JSON.']);
}

// Form pruefen: nur, was die Seite schickt.
$fehler = null;
if (!is_array($m) || ($m['v'] ?? null) !== 1)                          $fehler = 'Unbekanntes Format.';
elseif (($m['einwilligung'] ?? null) !== true)                          $fehler = 'Ohne Einwilligung wird nichts gespeichert.';
elseif (!in_array($m['art'] ?? null, ['fehler', 'wunsch'], true))      $fehler = 'Unbekannte Art.';
elseif (!is_string($m['text'] ?? null) || trim($m['text']) === '')     $fehler = 'Text fehlt.';
elseif (mb_strlen($m['text']) > MAX_TEXT)                               $fehler = 'Text zu lang.';
elseif (isset($m['kontakt']) && (!is_string($m['kontakt']) || mb_strlen($m['kontakt']) > 200)) $fehler = 'Kontakt ungültig.';
elseif (!is_array($m['zustand'] ?? null))                               $fehler = 'Zustand fehlt.';
elseif (isset($m['bild'])) {
  $b = $m['bild'];
  if (!is_string($b) || strlen($b) > MAX_BILD
      || !preg_match('#^data:image/(jpeg|png);base64,([A-Za-z0-9+/]+=*)$#', $b, $t)
      || base64_decode($t[2], true) === false) {
    $fehler = 'Bild ungültig.';
  }
}
if ($fehler !== null) antwort(422, ['ok' => false, 'fehler' => $fehler]);

$ablage = getenv('MELDUNG_DIR') ?: (getenv('HOME') ? getenv('HOME') . '/raumaufmass-bugreports' : '');
if ($ablage === '' || str_starts_with(realpath(dirname($ablage)) ?: '', realpath($_SERVER['DOCUMENT_ROOT'] ?? '/nirgends') ?: '/nirgends')) {
  // Nie unter dem Web-Wurzelordner ablegen: dort waeren die Meldungen abrufbar.
  antwort(500, ['ok' => false, 'fehler' => 'Ablage nicht eingerichtet.']);
}
if (!is_dir($ablage) && !@mkdir($ablage, 0700, true)) {
  antwort(500, ['ok' => false, 'fehler' => 'Ablage nicht beschreibbar.']);
}

// Obergrenze fuer alles, was noch nicht abgeholt ist: ein voller Speicher
// soll keine Flut von Meldungen das Hosting fuellen lassen.
$summe = 0; $anzahl = 0;
foreach (glob($ablage . '/M-*.json') ?: [] as $f) { $summe += filesize($f) ?: 0; $anzahl++; }
if ($anzahl >= MAX_DATEIEN || $summe + strlen($roh) > MAX_ABLAGE) {
  antwort(507, ['ok' => false, 'fehler' => 'Der Meldungsspeicher ist gerade voll. Bitte später noch einmal versuchen.']);
}

$id = 'M-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3));
$m['id'] = $id;
$m['empfangen'] = gmdate('c');
$ziel = $ablage . '/' . $id . '.json';
$tmp  = $ablage . '/.' . $id . '.tmp';
$alt = umask(0077);
$ok = file_put_contents($tmp, json_encode($m, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX) !== false
      && rename($tmp, $ziel);
umask($alt);
if (!$ok) { @unlink($tmp); antwort(500, ['ok' => false, 'fehler' => 'Speichern fehlgeschlagen.']); }

// Inhaltsfreie Benachrichtigung (nur wenn eingerichtet).
$an = @file_get_contents($ablage . '/.benachrichtigung');
$an = $an !== false ? trim($an) : '';
if ($an !== '' && filter_var($an, FILTER_VALIDATE_EMAIL) && function_exists('mail')) {
  $art = $m['art'] === 'wunsch' ? 'Funktionswunsch' : 'Fehlermeldung';
  // Absender auf der registrierten Domain (irazari-te.ch, nicht der Subdomain):
  // nur dort gibt es MX und SPF ("+mx" deckt den Webserver ab).
  $absender = 'raumaufmass@' . implode('.', array_slice(explode('.', explode(':', $host)[0]), -2));
  @mail($an, "Raumaufmaß: neue $art $id",
    "Neue Meldung $id ($art) liegt auf dem Server.\n\nAbholen (löscht sie dort):\n  scripts/bugreports-abholen.sh\n",
    "From: Raumaufmaß <$absender>\r\nContent-Type: text/plain; charset=utf-8",
    '-f' . $absender);
}

antwort(200, ['ok' => true, 'id' => $id]);
