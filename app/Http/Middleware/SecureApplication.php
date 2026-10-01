<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecureApplication
{
    public function handle(Request $request, Closure $next): Response
    {
        if (config('app.force_https')) {
            $canonicalHost = parse_url((string) config('app.url'), PHP_URL_HOST);
            $wrongScheme = ! $request->secure();
            $wrongHost = $canonicalHost && strcasecmp($request->getHost(), $canonicalHost) !== 0;

            if ($wrongScheme || $wrongHost) {
                $targetHost = $canonicalHost ?: $request->getHost();

                return redirect()->away('https://'.$targetHost.$request->getRequestUri(), 307);
            }
        }

        $response = $next($request);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'same-origin');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
        if ($request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
