<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_returns_user_permissions_and_regenerated_csrf_token(): void
    {
        $user = User::factory()->create(['email' => 'login@example.com', 'password' => bcrypt('password')]);

        $response = $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password']);

        $response->assertOk()->assertJsonStructure(['id', 'permissions', 'csrf_token']);
        $this->assertSame(session()->token(), $response->json('csrf_token'));
    }

    public function test_session_is_configured_for_seven_days(): void
    {
        $this->assertSame(7 * 24 * 60, config('session.lifetime'));
        $this->assertFalse(config('session.expire_on_close'));
    }

    public function test_login_session_survives_a_full_page_refresh(): void
    {
        $user = User::factory()->create([
            'email' => 'mobile-refresh@example.com',
            'password' => bcrypt('password'),
            'active' => true,
        ]);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->assertOk();

        $this->get('/')->assertOk();
        $this->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('id', $user->id)
            ->assertJsonPath('email', $user->email);
    }
}
