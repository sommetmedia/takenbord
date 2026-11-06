<?php
// API van het Sommet takenbord (PHP, voor shared hosting en lokaal via router.php).
//
// Mappen op de server:
//   ~/takenbord/<omgeving>/public/api.php     dit bestand (document root van het subdomein)
//   ~/takenbord/<omgeving>/seed.json          starttaken voor een lege database
//   ~/takenbord/<omgeving>/defaults.json      startlijst personen en klanten
//   ~/takenbord/<omgeving>/password.sha256    het gedeelde wachtwoord (hash), gezet door de deploy
//   ~/takenbord/<omgeving>/anthropic.key      Claude API-sleutel voor "taak uit tekst" (optioneel)
//   ~/takenbord-data/<omgeving>/              taken, instellingen en sessiesleutel (buiten de deploy)
// Lokaal zetten TAKENBORD_APP_DIR en TAKENBORD_DATA_DIR deze mappen; APP_PASSWORD kan dan als omgevingsvariabele.
//
// Inloggen: eigen e-mailadres (moet in Beheer staan) + het gedeelde wachtwoord.
// Beheer (personen en klanten) alleen voor personen met admin = true.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

$appDir  = getenv('TAKENBORD_APP_DIR') ?: dirname(__DIR__);
$env     = getenv('TAKENBORD_ENV') ?: basename($appDir);
$dataDir = getenv('TAKENBORD_DATA_DIR') ?: dirname($appDir, 2) . '/takenbord-data/' . $env;
$keyFile = $appDir . '/anthropic.key';
const SESSION_COOKIE = 'tb_sessie';
const SESSION_DAYS = 30;

function reply($status, $body = null) {
    http_response_code($status);
    if ($body !== null) echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function dataPath($name) {
    global $dataDir;
    if (!is_dir($dataDir) && !mkdir($dataDir, 0700, true) && !is_dir($dataDir)) reply(500, ['error' => 'Kan datamap niet aanmaken']);
    return $dataDir . '/' . $name;
}

// Leest een JSON-bestand, laat $change het aanpassen en schrijft het terug, met een lock tegen gelijktijdige schrijvers.
// $seed levert de beginwaarde als het bestand nog niet bestaat.
function withJson($name, $seed, $change = null) {
    $file = dataPath($name);
    $lock = fopen($file . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) reply(500, ['error' => 'Kan gegevens niet vergrendelen']);
    $raw = is_file($file) ? file_get_contents($file) : false;
    $value = $raw === false ? null : json_decode($raw, true);
    $fresh = !is_array($value);
    if ($fresh) $value = $seed();
    $result = $change ? $change($value) : null;
    if ($change || $fresh) {
        $tmp = $file . '.tmp';
        file_put_contents($tmp, json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        rename($tmp, $file);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    return [$value, $result];
}

function seedFrom($file) {
    return function () use ($file) {
        global $appDir;
        $raw = @file_get_contents($appDir . '/' . $file);
        return $raw ? (json_decode($raw, true) ?: []) : [];
    };
}

function settings() {
    [$s] = withJson('settings.json', seedFrom('defaults.json'));
    return $s + ['people' => [], 'clients' => []];
}

// ---- Wachtwoord en sessies -------------------------------------------------

function passwordHash() {
    global $appDir;
    $h = trim((string) @file_get_contents($appDir . '/password.sha256'));
    if ($h === '' && getenv('APP_PASSWORD')) $h = hash('sha256', getenv('APP_PASSWORD'));
    return $h;
}

// Sleutel voor de sessie-cookie. Hangt ook af van het wachtwoord: wachtwoord wijzigen logt iedereen uit.
function sessionKey() {
    $file = dataPath('session.key');
    if (!is_file($file)) {
        file_put_contents($file, bin2hex(random_bytes(32)), LOCK_EX);
        @chmod($file, 0600);
    }
    return hash_hmac('sha256', passwordHash(), trim(file_get_contents($file)));
}

function b64url($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }

function isHttps() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function setSessionCookie($value, $expires) {
    setcookie(SESSION_COOKIE, $value, [
        'expires' => $expires, 'path' => '/', 'secure' => isHttps(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

function findPerson($email) {
    $email = strtolower(trim((string) $email));
    foreach (settings()['people'] as $p) {
        if (strtolower($p['email'] ?? '') === $email && ($p['active'] ?? true)) return $p;
    }
    return null;
}

function currentUser() {
    $cookie = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!preg_match('/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/', $cookie, $m)) return null;
    if (!hash_equals(b64url(hash_hmac('sha256', $m[1], sessionKey(), true)), $m[2])) return null;
    $data = json_decode(base64_decode(strtr($m[1], '-_', '+/')), true);
    if (!is_array($data) || ($data['x'] ?? 0) < time()) return null;
    return findPerson($data['e'] ?? '');
}

function publicUser($p) {
    return ['name' => $p['name'], 'email' => $p['email'], 'admin' => !empty($p['admin'])];
}

// Max 10 mislukte pogingen per kwartier per IP-adres.
function tooManyFails($ip, $add = false) {
    [, $count] = withJson('login-fails.json', function () { return []; }, function (&$fails) use ($ip, $add) {
        $now = time();
        foreach ($fails as $k => $times) {
            $fails[$k] = array_values(array_filter($times, function ($t) use ($now) { return $t > $now - 900; }));
            if (!$fails[$k]) unset($fails[$k]);
        }
        if ($add) $fails[$ip][] = $now;
        return count($fails[$ip] ?? []);
    });
    return $count >= 10;
}

function body() {
    $in = json_decode(file_get_contents('php://input'), true);
    return is_array($in) ? $in : [];
}

$method = $_SERVER['REQUEST_METHOD'];
$path   = trim(isset($_GET['path']) ? $_GET['path'] : '', '/');

// Wijzigingen alleen als JSON: een formulier van een andere site kan dat niet zonder CORS-toestemming.
if ($method !== 'GET' && stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) reply(415, ['error' => 'json_required']);

if ($path === 'health') reply(200, ['ok' => true, 'env' => $env, 'php' => PHP_VERSION]);

if ($path === 'login' && $method === 'POST') {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '?';
    if (tooManyFails($ip)) reply(429, ['error' => 'too_many']);
    $in = body();
    $person = findPerson($in['email'] ?? '');
    $hash = passwordHash();
    $ok = $hash !== '' && hash_equals($hash, hash('sha256', (string) ($in['password'] ?? '')));
    if (!$person || !$ok) {
        tooManyFails($ip, true);
        reply(401, ['error' => 'invalid']);
    }
    $expires = time() + SESSION_DAYS * 86400;
    $payload = b64url(json_encode(['e' => strtolower($person['email']), 'x' => $expires]));
    setSessionCookie($payload . '.' . b64url(hash_hmac('sha256', $payload, sessionKey(), true)), $expires);
    reply(200, ['user' => publicUser($person)]);
}

if ($path === 'logout' && $method === 'POST') {
    setSessionCookie('', time() - 3600);
    reply(204);
}

// ---- Vanaf hier alleen ingelogd ------------------------------------------

$user = currentUser();
if (!$user) reply(401, ['error' => 'login_required']);

if ($path === 'me') reply(200, ['user' => publicUser($user), 'parse' => is_file($keyFile)]);

if ($path === 'settings' && $method === 'GET') reply(200, settings());

if ($path === 'settings' && $method === 'POST') {
    if (empty($user['admin'])) reply(403, ['error' => 'admin_only']);
    $in = body();
    $people = [];
    $clients = [];
    $names = [];
    $emails = [];
    foreach (($in['people'] ?? []) as $p) {
        $name = trim((string) ($p['name'] ?? ''));
        $email = strtolower(trim((string) ($p['email'] ?? '')));
        if ($name === '') continue;
        if (mb_strlen($name) > 40) reply(400, ['error' => "Naam te lang: $name"]);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) reply(400, ['error' => "Ongeldig e-mailadres bij $name"]);
        if (isset($names[mb_strtolower($name)])) reply(400, ['error' => "Naam komt twee keer voor: $name"]);
        if (isset($emails[$email])) reply(400, ['error' => "E-mailadres komt twee keer voor: $email"]);
        $names[mb_strtolower($name)] = $emails[$email] = true;
        $people[] = ['name' => $name, 'email' => $email, 'admin' => !empty($p['admin']), 'active' => ($p['active'] ?? true) !== false];
    }
    $activeAdmins = array_filter($people, function ($p) { return $p['admin'] && $p['active']; });
    if (!$activeAdmins) reply(400, ['error' => 'Er moet minstens één actieve beheerder zijn.']);
    $me = null;
    foreach ($people as $p) if ($p['email'] === strtolower($user['email'])) $me = $p;
    if (!$me || !$me['admin'] || !$me['active']) reply(400, ['error' => 'Je kunt jezelf geen beheerder-af maken of archiveren.']);
    $seen = [];
    foreach (($in['clients'] ?? []) as $c) {
        $name = trim((string) ($c['name'] ?? ''));
        if ($name === '') continue;
        if (mb_strlen($name) > 80) reply(400, ['error' => "Klantnaam te lang: $name"]);
        if (isset($seen[mb_strtolower($name)])) reply(400, ['error' => "Klant komt twee keer voor: $name"]);
        $seen[mb_strtolower($name)] = true;
        $site = strtolower(trim((string) ($c['site'] ?? '')));
        $site = preg_replace('#^https?://(www\.)?|/.*$#', '', $site);
        $clients[] = ['name' => $name, 'site' => $site, 'active' => ($c['active'] ?? true) !== false];
    }
    [$saved] = withJson('settings.json', seedFrom('defaults.json'), function (&$s) use ($people, $clients) {
        $s = ['people' => $people, 'clients' => $clients];
    });
    reply(200, $saved);
}

if ($path === 'tasks' && $method === 'GET') {
    [$tasks] = withJson('tasks.json', seedFrom('seed.json'));
    reply(200, array_values($tasks));
}

if (preg_match('#^tasks/([A-Za-z0-9_-]{1,100})(/delete)?$#', $path, $m)) {
    $id = $m[1];
    if ($method === 'POST' && !empty($m[2])) {
        withJson('tasks.json', seedFrom('seed.json'), function (&$tasks) use ($id) {
            $tasks = array_values(array_filter($tasks, function ($t) use ($id) { return ($t['id'] ?? '') !== $id; }));
        });
        reply(204);
    }
    if ($method === 'POST' && empty($m[2])) {
        $task = body();
        if (!$task) reply(400, ['error' => 'Ongeldige taak']);
        $task['id'] = $id;
        $task['updatedAt'] = gmdate('Y-m-d\TH:i:s\Z');
        $task['updatedBy'] = $user['name'];
        withJson('tasks.json', seedFrom('seed.json'), function (&$tasks) use ($task) {
            $tasks = array_values($tasks);
            foreach ($tasks as $i => $t) {
                if (($t['id'] ?? '') === $task['id']) { $tasks[$i] = $task; return; }
            }
            $tasks[] = $task;
        });
        reply(200, $task);
    }
}

// Taak uit tekst: de frontend bouwt de prompt, Claude geeft JSON terug.
if ($path === 'parse' && $method === 'POST') {
    $key = is_file($keyFile) ? trim(file_get_contents($keyFile)) : '';
    if ($key === '') reply(503, ['error' => 'not_configured']);
    $in = body();
    $prompt = isset($in['prompt']) && is_string($in['prompt']) ? $in['prompt'] : '';
    if ($prompt === '' || strlen($prompt) > 200000) reply(400, ['error' => 'bad_prompt']);

    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-api-key: ' . $key,
            'anthropic-version: 2026-10-21',
            'anthropic-beta: server-side-fallback-2026-07-01',
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'model' => 'claude-opus-5-5',
            'max_tokens' => 8000,
            'output_config' => ['effort' => 'low'],
            'fallbacks' => 'default',
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ]),
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false) reply(502, ['error' => 'unreachable']);
    if ($status === 429 || $status === 529) reply(429, ['error' => 'rate_limited']);
    $res = json_decode($raw, true);
    if ($status !== 200 || !is_array($res)) {
        error_log('takenbord parse: Claude API ' . $status . ' ' . substr($raw, 0, 300));
        reply(502, ['error' => 'api_error']);
    }
    if (($res['stop_reason'] ?? '') === 'refusal') reply(422, ['error' => 'refused']);
    $text = '';
    foreach ($res['content'] ?? [] as $block) {
        if (($block['type'] ?? '') === 'text') $text .= $block['text'];
    }
    $start = strpos($text, '{');
    $end = strrpos($text, '}');
    $task = ($start !== false && $end > $start) ? json_decode(substr($text, $start, $end - $start + 1), true) : null;
    if (!is_array($task)) reply(422, ['error' => 'no_json']);
    reply(200, $task);
}

reply(404, ['error' => 'Niet gevonden']);
