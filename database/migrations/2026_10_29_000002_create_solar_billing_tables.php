<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Solar Billing Companies (Rajeshwari Solar, Sunrise, Nilkanth, etc.)
        if (! Schema::hasTable('solar_billing_companies')) {
            Schema::create('solar_billing_companies', function (Blueprint $table) {
                $table->id();
                $table->string('name', 150);
                $table->string('gstin', 30)->nullable();
                $table->text('address')->nullable();
                $table->string('phones', 100)->nullable();
                $table->string('bank_name', 150)->nullable();
                $table->string('bank_ac', 50)->nullable();
                $table->string('bank_ifsc', 30)->nullable();
                $table->decimal('discount', 8, 2)->nullable(); // null means use global default discount
                $table->string('inv_prefix', 20)->default('RS');
                $table->unsignedInteger('last_seq')->default(0);
                $table->string('logo_path')->nullable();
                $table->boolean('active')->default(true);
                $table->timestamps();
            });

            // Seed default 3 companies from billing-engine data
            DB::table('solar_billing_companies')->insert([
                [
                    'id' => 1,
                    'name' => 'RAJESHWARI SOLAR',
                    'gstin' => '24ABJFR7554G1ZX',
                    'address' => 'Plot No-131, Panchpada, Paliyad Road, Shivajinagar, Botad-364710',
                    'phones' => '6353116138, 9924283670',
                    'bank_name' => 'State Bank of India, Paliyad Road, Botad',
                    'bank_ac' => '44295348601',
                    'bank_ifsc' => 'SBIN0005946',
                    'discount' => 1.25,
                    'inv_prefix' => 'RS',
                    'last_seq' => 2, // Aug-26 is RS/26-27/01, Sep-26 is RS/26-27/02
                    'logo_path' => null,
                    'active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'id' => 2,
                    'name' => 'SUNRISE GREEN ENERGY',
                    'gstin' => null,
                    'address' => null,
                    'phones' => null,
                    'bank_name' => null,
                    'bank_ac' => null,
                    'bank_ifsc' => null,
                    'discount' => null,
                    'inv_prefix' => 'SUN',
                    'last_seq' => 0,
                    'logo_path' => null,
                    'active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'id' => 3,
                    'name' => 'NILKANTH GREEN ENERGY',
                    'gstin' => null,
                    'address' => null,
                    'phones' => null,
                    'bank_name' => null,
                    'bank_ac' => null,
                    'bank_ifsc' => null,
                    'discount' => null,
                    'inv_prefix' => 'NIL',
                    'last_seq' => 0,
                    'logo_path' => null,
                    'active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }

        // 2. Solar Billing Configuration / Settings Key-Value Table
        if (! Schema::hasTable('solar_billing_settings')) {
            Schema::create('solar_billing_settings', function (Blueprint $table) {
                $table->id();
                $table->string('key', 100)->unique();
                $table->text('value')->nullable();
                $table->timestamps();
            });

            // Seed default settings
            $defaultSettings = [
                'default_discount' => '1.25',
                'interest_pct' => '18.00',
                'loss_pct' => '6.50',
                'due_days' => '15',
                'cross_pct' => '15.00',
                'wheel_rate' => '0.2352',
                'default_customer_name' => 'Blueart Granito Pvt. Ltd.',
                'default_customer_address' => 'S.No. 93/1P3, B/h. Keda Ceramic, Paneli Road, Morbi-363642',
                'default_customer_gstin' => '24AABCO3285B1ZU',
                'signature_url' => '',
            ];

            foreach ($defaultSettings as $k => $v) {
                DB::table('solar_billing_settings')->insert([
                    'key' => $k,
                    'value' => $v,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        // 3. Solar Bills Master Ledger Table
        if (! Schema::hasTable('solar_bills')) {
            Schema::create('solar_bills', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained('solar_billing_companies')->restrictOnDelete();
                $table->string('month', 30); // e.g. 'Oct-26', 'Aug-26'
                $table->string('invoice_no', 100)->unique(); // UNIQUE constraint preventing collision
                $table->date('invoice_date');
                $table->date('due_date');

                // Customer info
                $table->string('customer_name', 255);
                $table->text('customer_address')->nullable();
                $table->string('customer_gstin', 50)->nullable();

                // Units
                $table->decimal('units_credited', 15, 2);
                $table->decimal('units_peak', 15, 2)->default(0.00);
                $table->decimal('units_banking', 15, 2)->default(0.00);
                $table->decimal('units_generated', 15, 2);

                // Source of truth: raw inputs, derived rates & full calculation breakdown
                $table->json('stmt_inputs')->nullable();
                $table->json('rates_derived')->nullable();
                $table->json('extra_params')->nullable();
                $table->json('breakdown'); // Full mathematical breakdown

                // Financial columns
                $table->decimal('sub_total', 15, 2); // Net PGVCL Credit before discount
                $table->decimal('discount_rate', 8, 2)->default(1.25);
                $table->decimal('discount_amt', 15, 2)->default(0.00);
                $table->decimal('prev_balance', 15, 2)->default(0.00);
                $table->decimal('interest_amt', 15, 2)->default(0.00); // Snapshot at creation time
                $table->unsignedInteger('interest_days')->default(0);
                $table->decimal('round_off', 6, 2)->default(0.00);
                $table->decimal('current_grand_total', 15, 2); // Subtotal - Discount + Roundoff
                $table->decimal('total_outstanding', 15, 2); // Current Grand + Prev Balance + Interest

                // Audit & Lifecycle Status: pending, paid, void
                $table->string('status', 30)->default('pending');
                $table->timestamp('paid_at')->nullable();
                $table->timestamp('voided_at')->nullable();
                $table->foreignId('voided_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('void_reason')->nullable();

                // Statement PDF audit trail
                $table->string('pdf_path')->nullable();
                $table->text('notes')->nullable();

                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['company_id', 'status', 'invoice_date']);
                $table->index(['month', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('solar_bills');
        Schema::dropIfExists('solar_billing_settings');
        Schema::dropIfExists('solar_billing_companies');
    }
};
