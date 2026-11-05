<?php
// API van het Sommet takenbord voor gewone (shared) hosting met PHP.
// Zelfde endpoints als server.js. Mappen op de server:
//   ~/takenbord/<omgeving>/public/api.php   (dit bestand, document root van het subdomein)
//   ~/takenbord/<omgeving>/seed.json        (starttaken, alleen bij een lege database)
//   ~/takenbord-data/<omgeving>/tasks.json  (de taken, buiten de deploy-map)
//   ~/takenbord/<omgeving>/anthropic.key    (Claude API-sleutel voor "taak uit tekst", door de deploy gezet)
// Het wachtwoord regelt Apache via .htaccess/.htpasswd, daar hoeft dit script niets voor te doen.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$appDir  = dirname(__DIR__);
$env     = basename($appDir);
$dataDir = dirname($appDir, 2) . '/takenbord-data/' . $env;
$file    = $dataDir . '/tasks.json';
$keyFile = $appDir . '/anthropic.key';

function reply($status, $body = null) {
    http_response_code($status);
    if ($body !== null) echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Leest de taken, laat $change ze aanpassen en schrijft ze terug, met een lock tegen gelijktijdige schrijvers.
function withTasks($change) {
    global $dataDir, $file, $appDir;
    if (!is_dir($dataDir) && !mkdir($dataDir, 0700, true) && !is_dir($dataDir)) reply(500, ['error' => 'Kan datamap niet aanmaken']);
    $lock = fopen($file . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) reply(500, ['error' => 'Kan taken niet vergrendelen']);
    $raw = is_file($file) ? file_get_contents($file) : false;
    $tasks = $raw === false ? null : json_decode($raw, true);
    $fresh = !is_array($tasks);
    if ($fresh) {
        $seed = @file_get_contents($appDir . '/seed.json');
        $tasks = $seed ? (json_decode($seed, true) ?: []) : [];
    }
    $result = $change ? $change($tasks) : null;
    if ($change || $fresh) {
        $tmp = $file . '.tmp';
        file_put_contents($tmp, json_encode(array_values($tasks), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        rename($tmp, $file);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    return [$tasks, $result];
}

$method = $_SERVER['REQUEST_METHOD'];
$path   = trim(isset($_GET['path']) ? $_GET['path'] : '', '/');

if ($path === 'health') reply(200, ['ok' => true, 'env' => $env, 'php' => PHP_VERSION, 'parse' => is_file($keyFile)]);

// Taak uit tekst: de frontend bouwt de prompt, Claude geeft JSON terug.
if ($path === 'parse' && $method === 'POST') {
    $key = is_file($keyFile) ? trim(file_get_contents($keyFile)) : '';
    if ($key === '') reply(503, ['error' => 'not_configured']);
    $in = json_decode(file_get_contents('php://input'), true);
    $prompt = is_array($in) && isset($in['prompt']) && is_string($in['prompt']) ? $in['prompt'] : '';
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

if ($path === 'tasks' && $method === 'GET') {
    [$tasks] = withTasks(null);
    reply(200, array_values($tasks));
}

if (preg_match('#^tasks/([A-Za-z0-9_-]{1,100})(/delete)?$#', $path, $m)) {
    $id = $m[1];
    $delete = $method === 'DELETE' || ($method === 'POST' && !empty($m[2]));
    if ($delete) {
        withTasks(function (&$tasks) use ($id) {
            $tasks = array_values(array_filter($tasks, function ($t) use ($id) { return ($t['id'] ?? '') !== $id; }));
        });
        reply(204);
    }
    if (($method === 'PUT' || $method === 'POST') && empty($m[2])) {
        $task = json_decode(file_get_contents('php://input'), true);
        if (!is_array($task)) reply(400, ['error' => 'Ongeldige taak']);
        $task['id'] = $id;
        $task['updatedAt'] = gmdate('Y-m-d\TH:i:s.v\Z');
        withTasks(function (&$tasks) use ($task) {
            foreach ($tasks as $i => $t) {
                if (($t['id'] ?? '') === $task['id']) { $tasks[$i] = $task; return; }
            }
            $tasks[] = $task;
        });
        reply(200, $task);
    }
}

reply(404, ['error' => 'Niet gevonden']);
