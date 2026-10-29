<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('solar_billing_companies')) {
            Schema::table('solar_billing_companies', function (Blueprint $table) {
                if (! Schema::hasColumn('solar_billing_companies', 'signature_enabled')) {
                    $table->boolean('signature_enabled')->default(true)->after('signature_path');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('solar_billing_companies')) {
            Schema::table('solar_billing_companies', function (Blueprint $table) {
                if (Schema::hasColumn('solar_billing_companies', 'signature_enabled')) {
                    $table->dropColumn('signature_enabled');
                }
            });
        }
    }
};
