<?php

namespace Tests\Feature;

use Tests\TestCase;

class MobileReadinessTest extends TestCase
{
    public function test_web_responses_include_mobile_security_headers(): void
    {
        $response = $this->get('/');

        $response->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Referrer-Policy', 'same-origin')
            ->assertHeader('X-Frame-Options', 'SAMEORIGIN')
            ->assertHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
    }

    public function test_production_http_requests_are_redirected_to_https(): void
    {
        config(['app.force_https' => true]);

        $response = $this->get('http://localhost/');

        $response->assertStatus(307)
            ->assertRedirect('https://localhost/');
    }

    public function test_production_requests_are_redirected_to_the_configured_canonical_host(): void
    {
        config([
            'app.force_https' => true,
            'app.url' => 'https://www.solar.example.com',
        ]);

        $response = $this->get('http://solar.example.com/?month=2026-09');

        $response->assertStatus(307)
            ->assertRedirect('https://www.solar.example.com/?month=2026-09');
    }

    public function test_https_responses_include_hsts(): void
    {
        $response = $this->get('https://localhost/');

        $response->assertOk()
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    public function test_native_projects_declare_required_camera_and_location_permissions(): void
    {
        $androidManifest = file_get_contents(base_path('android/app/src/main/AndroidManifest.xml'));
        $iosInfo = file_get_contents(base_path('ios/App/App/Info.plist'));
        $capacitorConfig = file_get_contents(base_path('capacitor.config.ts'));

        $this->assertStringContainsString('android.permission.CAMERA', $androidManifest);
        $this->assertStringContainsString('android.permission.ACCESS_FINE_LOCATION', $androidManifest);
        $this->assertStringContainsString('android:usesCleartextTraffic="false"', $androidManifest);
        $this->assertStringContainsString('NSCameraUsageDescription', $iosInfo);
        $this->assertStringContainsString('NSLocationWhenInUseUsageDescription', $iosInfo);
        $this->assertStringContainsString('SOLARFLOW_MOBILE_URL must use HTTPS', $capacitorConfig);
        $this->assertFileExists(base_path('mobile-shell/index.html'));
    }
}
