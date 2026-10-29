<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('solar_billing_charges', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code');
            $table->enum('type', ['charge', 'rebate']); // charge = +, rebate = -
            $table->enum('calc_basis', [
                'per_unit',          // Credited units: credited * value
                'per_banking_unit',  // Banking units: banking * value
                'per_peak_unit',     // Peak units: peak * value
                'per_gen_unit',      // Generated units: gen * value
                'pct_energy',        // % of energy amt: energy * value / 100
                'pct_energy_fca',    // % of (energy + fca) amt
                'pct_board',         // % of board charge
                'fixed',             // Fixed ₹ amount
            ]);
            $table->decimal('value', 12, 4);
            $table->foreignId('company_id')->nullable()->constrained('solar_billing_companies')->nullOnDelete();
            $table->date('effective_from')->default('2026-01-01');
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['code', 'is_active', 'effective_from']);
        });

        // Seed initial default charges & rebates (Global - company_id NULL)
        $now = now();
        DB::table('solar_billing_charges')->insert([
            [
                'name' => 'Cross Subsidy',
                'code' => 'cross_subsidy',
                'type' => 'rebate',
                'calc_basis' => 'pct_energy_fca',
                'value' => 15.0000,
                'company_id' => null,
                'effective_from' => '2026-01-01',
                'effective_to' => null,
                'is_active' => true,
                'sort_order' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Wheeling Charge',
                'code' => 'wheeling',
                'type' => 'rebate',
                'calc_basis' => 'per_gen_unit',
                'value' => 0.2352,
                'company_id' => null,
                'effective_from' => '2026-01-01',
                'effective_to' => null,
                'is_active' => true,
                'sort_order' => 2,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Banking Charge',
                'code' => 'banking',
                'type' => 'rebate',
                'calc_basis' => 'per_banking_unit',
                'value' => 1.5000,
                'company_id' => null,
                'effective_from' => '2026-01-01',
                'effective_to' => null,
                'is_active' => true,
                'sort_order' => 3,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Discount (PPA)',
                'code' => 'ppa_discount',
                'type' => 'rebate',
                'calc_basis' => 'per_unit',
                'value' => 1.2500,
                'company_id' => null,
                'effective_from' => '2026-01-01',
                'effective_to' => null,
                'is_active' => true,
                'sort_order' => 4,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('solar_billing_charges');
    }
};
