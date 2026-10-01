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
        Schema::table('companies', function (Blueprint $table) {
            $table->decimal('latitude', 10, 7)->nullable()->default(22.3039)->after('is_ss_reference'); // Gujarat default
            $table->decimal('longitude', 10, 7)->nullable()->default(70.8022)->after('latitude');
            $table->string('plant_location', 150)->nullable()->default('Rajkot, Gujarat')->after('longitude');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'plant_location']);
        });
    }
};
