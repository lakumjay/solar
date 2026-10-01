<?php
$secretKey = 'solar_deploy_secure_key_2026';
$providedToken = $_GET['token'] ?? '';

if ($providedToken !== $secretKey) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Unauthorized: Invalid token'], JSON_PRETTY_PRINT);
    exit;
}

$repoPath = '/home3/snweba2e/repositories/solar';
$webPath  = '/home3/snweba2e/rns.snwebkarma.in';

$logs = [];
$logs[] = "Deployment initiated at " . date('Y-m-d H:i:s');
exec("cd $repoPath && git pull origin main 2>&1", $logs);
exec("/bin/cp -R $repoPath/* $webPath/ 2>&1", $logs);
exec("cd $webPath && php artisan optimize:clear 2>&1", $logs);

header('Content-Type: application/json');
echo json_encode([
    'status'  => 'success',
    'message' => 'Deployment executed successfully!',
    'log'     => $logs
], JSON_PRETTY_PRINT);
