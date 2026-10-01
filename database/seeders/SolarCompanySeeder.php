<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Inverter;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class SolarCompanySeeder extends Seeder
{
    public function run(): void
    {
        $companies = [
            ['name' => 'Sunrise Green Energy', 'inverters' => 2, 'email' => 'sunrise@solar.local'],
            ['name' => 'Rajeshwari Solar', 'inverters' => 4, 'email' => 'rajeshwari@solar.local'],
            ['name' => 'Nilkanth Green Energy', 'inverters' => 4, 'email' => 'nilkanth@solar.local'],
        ];

        foreach ($companies as $item) {
            $company = Company::firstOrCreate(['name' => $item['name']]);
            for ($number = 1; $number <= $item['inverters']; $number++) {
                Inverter::firstOrCreate(['company_id' => $company->id, 'name' => 'Inverter '.$number]);
            }

            User::firstOrCreate(
                ['email' => $item['email']],
                [
                    'company_id' => $company->id,
                    'name' => $item['name'].' Admin',
                    'password' => Hash::make(config('solar.seed.company_user_password')),
                    'role' => 'company_admin',
                    'active' => true,
                ],
            );
        }

        $reference = Company::where('active', true)
            ->where('is_ss_reference', true)
            ->oldest('id')
            ->first()
            ?? Company::where('active', true)->where('name', 'Sunrise Green Energy')->first()
            ?? Company::where('active', true)->oldest('id')->first();

        if ($reference) {
            Company::whereKeyNot($reference->id)->update(['is_ss_reference' => false]);
            $reference->update(['is_ss_reference' => true]);
        }
    }
}
