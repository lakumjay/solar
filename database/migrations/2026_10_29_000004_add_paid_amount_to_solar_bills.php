<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('solar_bills') && ! Schema::hasColumn('solar_bills', 'paid_amount')) {
            Schema::table('solar_bills', function (Blueprint $table) {
                $table->decimal('paid_amount', 15, 2)->default(0.00)->after('status');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('solar_bills') && Schema::hasColumn('solar_bills', 'paid_amount')) {
            Schema::table('solar_bills', function (Blueprint $table) {
                $table->dropColumn('paid_amount');
            });
        }
    }
};
