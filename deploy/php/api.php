<?php
// API van het Sommet takenbord voor gewone (shared) hosting met PHP.
// Zelfde endpoints als server.js. Mappen op de server:
//   ~/takenbord/<omgeving>/public/api.php   (dit bestand, document root van het subdomein)
//   ~/takenbord/<omgeving>/seed.json        (starttaken, alleen bij een lege database)
//   ~/takenbord-data/<omgeving>/tasks.json  (de taken, buiten de deploy-map)
// Het wachtwoord regelt Apache via .htaccess/.htpasswd, daar hoeft dit script niets voor te doen.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$appDir  = dirname(__DIR__);
$env     = basename($appDir);
$dataDir = dirname($appDir, 2) . '/takenbord-data/' . $env;
$file    = $dataDir . '/tasks.json';

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

if ($path === 'health') reply(200, ['ok' => true, 'env' => $env, 'php' => PHP_VERSION]);

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
