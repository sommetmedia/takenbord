<?php
// Lokaal ontwikkelen: php -S 127.0.0.1:3001 deploy/php/router.php (Vite proxyt /api hiernaartoe).
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (strpos($uri, '/api/') === 0) {
    $_GET['path'] = substr($uri, 5);
    require __DIR__ . '/api.php';
    return true;
}
http_response_code(404);
return true;
