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
}
