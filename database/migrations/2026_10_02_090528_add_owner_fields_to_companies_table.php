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
            $table->string('owner_name')->nullable()->after('name');
            $table->string('owner_designation')->nullable()->after('owner_name');
            $table->string('owner_photo_path')->nullable()->after('owner_designation');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn(['owner_name', 'owner_designation', 'owner_photo_path']);
        });
    }
};
