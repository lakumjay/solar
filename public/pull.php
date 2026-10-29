<?php
// Standalone deployment endpoint with authenticated GitHub sync
header('Content-Type: application/json; charset=utf-8');

$secret = $_GET['secret'] ?? $_POST['secret'] ?? '';
if ($secret !== 'solarflow_auto_deploy_2026') {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden: Invalid deployment secret']);
    exit;
}

require_once __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

/** @var \App\Services\SystemAutoDoctorService $doctor */
$doctor = app(\App\Services\SystemAutoDoctorService::class);
$sync = $doctor->syncAndDeployFromGit();
$heal = $doctor->healDatabaseAndSystem();

echo json_encode([
    'success' => true,
    'sync' => $sync,
    'heal' => $heal,
]);
