<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inverter;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_seeder_creates_complete_initial_setup_idempotently(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(3, Company::count());
        $this->assertSame(10, Inverter::count());
        $this->assertSame(4, User::count());

        $admin = User::where('email', config('solar.seed.super_admin_email'))->firstOrFail();
        $this->assertSame('super_admin', $admin->role);
        $this->assertNull($admin->company_id);
        $this->assertTrue(Hash::check(config('solar.seed.super_admin_password'), $admin->password));

        $this->assertSame(2, Company::where('name', 'Sunrise Green Energy')->firstOrFail()->inverters()->count());
        $this->assertSame(4, Company::where('name', 'Rajeshwari Solar')->firstOrFail()->inverters()->count());
        $this->assertSame(4, Company::where('name', 'Nilkanth Green Energy')->firstOrFail()->inverters()->count());
    }
}
