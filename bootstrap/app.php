<?php

use App\Http\Middleware\SecureApplication;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

$application = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        if ($trustedProxies = env('TRUSTED_PROXIES')) {
            $middleware->trustProxies(at: $trustedProxies === '*' ? '*' : array_map('trim', explode(',', $trustedProxies)));
        }
        $middleware->appendToGroup('web', SecureApplication::class);
        $middleware->redirectGuestsTo(fn () => '/');
        $middleware->validateCsrfTokens(except: [
            'api/voice-agent/*',
            'api/isolarcloud/callback',
            'api/ai-help-center/webhook-deploy',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->reportable(function (\Throwable $e) {
            if ($e instanceof \Illuminate\Database\QueryException) {
                try {
                    app(\App\Services\SystemAutoDoctorService::class)->healDatabaseAndSystem(false);
                } catch (\Throwable $_) {
                }
            }
        });
    })->create();

if ($storagePath = env('APP_STORAGE_PATH')) {
    $application->useStoragePath($storagePath);
}

return $application;
