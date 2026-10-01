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
        Schema::create('isolarcloud_tokens', function (Blueprint $table) {
            $table->id();
            $table->text('access_token');
            $table->text('refresh_token')->nullable();
            $table->string('token_type')->default('bearer');
            $table->unsignedInteger('expires_in')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->string('auth_user')->nullable();
            $table->json('auth_ps_list')->nullable();
            $table->json('raw_response')->nullable();
            $table->timestamps();
        });

        Schema::table('inverters', function (Blueprint $table) {
            $table->string('serial_number', 100)->nullable()->after('name');
            $table->string('device_type', 20)->default('1')->after('serial_number');
            $table->string('point_id', 50)->nullable()->after('device_type');
        });
    }

    public function down(): void
    {
        Schema::table('inverters', function (Blueprint $table) {
            $table->dropColumn(['serial_number', 'device_type', 'point_id']);
        });

        Schema::dropIfExists('isolarcloud_tokens');
    }
};
