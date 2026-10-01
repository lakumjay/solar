<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        User::firstOrCreate(
            ['email' => config('solar.seed.super_admin_email')],
            [
                'name' => 'Super Admin',
                'password' => Hash::make(config('solar.seed.super_admin_password')),
                'role' => 'super_admin',
                'company_id' => null,
                'active' => true,
            ],
        );
    }
}
