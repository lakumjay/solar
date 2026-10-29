<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('solar_billing_companies')) {
            // 1. Update Sunrise Green Energy with official GSTIN, Bank A/c, and details
            DB::table('solar_billing_companies')
                ->where('id', 2)
                ->orWhere('name', 'like', '%SUNRISE%')
                ->update([
                    'gstin' => '24FFNPP9576P1Z4',
                    'bank_name' => 'State Bank of India',
                    'bank_ac' => '44588738053',
                    'bank_ifsc' => 'SBIN0005946',
                    'address' => 'Plot No-131, Panchpada, Paliyad Road, Shivajinagar, Botad-364710',
                    'phones' => '6353116138, 9924283670',
                    'discount' => 1.25,
                    'inv_prefix' => 'SUN',
                    'logo_path' => '/images/companies/sunrise-logo.png',
                    'updated_at' => now(),
                ]);

            // 2. Ensure Rajeshwari Solar details are intact
            DB::table('solar_billing_companies')
                ->where('id', 1)
                ->orWhere('name', 'like', '%RAJESHWARI%')
                ->update([
                    'gstin' => '24ABJFR7554G1ZX',
                    'bank_name' => 'State Bank of India, Paliyad Road, Botad',
                    'bank_ac' => '44295348601',
                    'bank_ifsc' => 'SBIN0005946',
                    'address' => 'Plot No-131, Panchpada, Paliyad Road, Shivajinagar, Botad-364710',
                    'phones' => '6353116138, 9924283670',
                    'discount' => 1.25,
                    'inv_prefix' => 'RS',
                    'logo_path' => '/images/companies/rajeshwari-logo.png',
                    'updated_at' => now(),
                ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No reversal needed for data updates
    }
};
