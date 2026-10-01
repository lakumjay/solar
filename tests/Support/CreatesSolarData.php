<?php

namespace Tests\Support;

use App\Models\Company;
use App\Models\Inverter;
use App\Models\User;

trait CreatesSolarData
{
    protected function solarCompany(array $overrides = []): Company
    {
        $company = Company::create(array_merge([
            'name' => 'Test Solar',
            'plant_import_multiplier' => 10,
            'plant_export_multiplier' => 20,
            'sub_import_multiplier' => 30,
            'sub_export_multiplier' => 40,
        ], $overrides));
        $company->refresh();

        if (($overrides['is_ss_reference'] ?? false) === true) {
            Company::whereKeyNot($company->id)->update(['is_ss_reference' => false]);
            $company->update(['is_ss_reference' => true]);
        } elseif ($company->active && ! Company::where('is_ss_reference', true)->exists()) {
            $company->update(['is_ss_reference' => true]);
        }

        return $company->refresh();
    }

    protected function superAdmin(): User
    {
        return User::factory()->create(['role' => 'super_admin']);
    }

    protected function readingPayload(Company $company, Inverter $inverter, string $date, array $readings, float $generation = 125.5): array
    {
        return [
            'company_id' => $company->id,
            'reading_date' => $date,
            'plant_import_reading' => $readings[0],
            'plant_export_reading' => $readings[1],
            'sub_import_reading' => $readings[2],
            'sub_export_reading' => $readings[3],
            'outputs' => [['inverter_id' => $inverter->id, 'generation' => $generation]],
        ];
    }
}
