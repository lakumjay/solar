<?php

use App\Models\Company;
use App\Models\Inverter;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $serials = [
            'Sunrise Green Energy' => [
                'Inverter 1' => 'I2640800630',
                'Inverter 2' => 'I2640800623',
            ],
            'Rajeshwari Solar' => [
                'Inverter 1' => 'I2640800633',
                'Inverter 2' => 'I2640800649',
                'Inverter 3' => 'I2640800585',
                'Inverter 4' => 'I2640800223',
            ],
            'Nilkanth Green Energy' => [
                'Inverter 1' => 'I2633100421',
                'Inverter 2' => 'I2633100362',
                'Inverter 3' => 'I2633100382',
                'Inverter 4' => 'I2640800227',
            ],
        ];

        foreach ($serials as $companyName => $invList) {
            $company = Company::where('name', $companyName)->first();
            if (! $company) {
                continue;
            }

            foreach ($invList as $invName => $sn) {
                Inverter::where('company_id', $company->id)
                    ->where('name', $invName)
                    ->where(function ($q) {
                        $q->whereNull('serial_number')
                            ->orWhere('serial_number', '')
                            ->orWhere('serial_number', 'N/A');
                    })
                    ->update(['serial_number' => $sn]);
            }
        }
    }

    public function down(): void
    {
        // Safe no-op on rollback
    }
};
