<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('solar_billing_companies', function (Blueprint $table) {
            if (! Schema::hasColumn('solar_billing_companies', 'signature_path')) {
                $table->string('signature_path')->nullable()->after('logo_path');
            }
            if (! Schema::hasColumn('solar_billing_companies', 'letterhead_path')) {
                $table->string('letterhead_path')->nullable()->after('signature_path');
            }
            if (! Schema::hasColumn('solar_billing_companies', 'letterhead_mode')) {
                $table->string('letterhead_mode', 30)->default('digital')->after('letterhead_path'); // digital | custom_image | preprinted
            }
            if (! Schema::hasColumn('solar_billing_companies', 'due_days')) {
                $table->unsignedInteger('due_days')->default(15)->nullable()->after('letterhead_mode');
            }
            if (! Schema::hasColumn('solar_billing_companies', 'interest_pct')) {
                $table->decimal('interest_pct', 5, 2)->default(18.0)->nullable()->after('due_days');
            }
            if (! Schema::hasColumn('solar_billing_companies', 'loss_pct')) {
                $table->decimal('loss_pct', 5, 2)->default(6.50)->nullable()->after('interest_pct');
            }
            if (! Schema::hasColumn('solar_billing_companies', 'wheel_rate')) {
                $table->decimal('wheel_rate', 8, 4)->default(0.2352)->nullable()->after('loss_pct');
            }
            if (! Schema::hasColumn('solar_billing_companies', 'bank_rate')) {
                $table->decimal('bank_rate', 8, 4)->default(1.5000)->nullable()->after('wheel_rate');
            }
            if (! Schema::hasColumn('solar_billing_companies', 'cross_pct')) {
                $table->decimal('cross_pct', 5, 2)->default(15.00)->nullable()->after('bank_rate');
            }
        });
    }

    public function down(): void
    {
        Schema::table('solar_billing_companies', function (Blueprint $table) {
            $table->dropColumn([
                'signature_path', 'letterhead_path', 'letterhead_mode',
                'due_days', 'interest_pct', 'loss_pct', 'wheel_rate', 'bank_rate', 'cross_pct'
            ]);
        });
    }
};
