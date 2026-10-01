<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_breaks', function (Blueprint $table) {
            $table->string('return_selfie_path')->nullable()->after('ended_at');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_breaks', function (Blueprint $table) {
            $table->dropColumn('return_selfie_path');
        });
    }
};
