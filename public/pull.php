<?php
// Standalone zero-dependency deployment script
header('Content-Type: text/plain; charset=utf-8');

$secret = $_GET['secret'] ?? $_POST['secret'] ?? '';
if ($secret !== 'solarflow_auto_deploy_2026') {
    http_response_code(403);
    echo "Forbidden: Invalid deployment secret\n";
    exit;
}

$baseDir = dirname(__DIR__);
$output = [];

exec("cd " . escapeshellarg($baseDir) . " && git fetch origin main 2>&1", $output);
exec("cd " . escapeshellarg($baseDir) . " && git reset --hard origin/main 2>&1", $output);
exec("cd " . escapeshellarg($baseDir) . " && php artisan optimize:clear 2>&1", $output);

echo "DEPLOY_SUCCESS\n";
echo implode("\n", $output);
