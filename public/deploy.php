<?php
<<<<<<< HEAD
$secretKey = 'solar_deploy_secure_key_2026';
=======
/**
 * Auto-Deployment Webhook for SolarFlow on cPanel
 */
$secretKey = 'solar_deploy_secure_key_2026';

// Check GET parameter token or GitHub payload
>>>>>>> 940dc1e631945305f390e76db0e0053553b2796a
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
<<<<<<< HEAD
exec("cd $repoPath && git pull origin main 2>&1", $logs);
exec("/bin/cp -R $repoPath/* $webPath/ 2>&1", $logs);
=======

// 1. Pull latest changes from GitHub
exec("cd $repoPath && git pull origin main 2>&1", $logs);

// 2. Copy code to web directory
exec("/bin/cp -R $repoPath/* $webPath/ 2>&1", $logs);

// 3. Optimize Laravel cache
>>>>>>> 940dc1e631945305f390e76db0e0053553b2796a
exec("cd $webPath && php artisan optimize:clear 2>&1", $logs);

header('Content-Type: application/json');
echo json_encode([
    'status'  => 'success',
    'message' => 'Deployment executed successfully!',
    'log'     => $logs
], JSON_PRETTY_PRINT);
