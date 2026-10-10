<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->string('ip_address', 45)->nullable()->after('description');
            $table->text('user_agent')->nullable()->after('ip_address');
            $table->string('device', 100)->nullable()->after('user_agent');
            $table->string('platform', 60)->nullable()->after('device');
            $table->string('browser', 60)->nullable()->after('platform');
            $table->json('old_values')->nullable()->after('changes');
            $table->json('new_values')->nullable()->after('old_values');
            $table->index('ip_address');
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropIndex(['ip_address']);
            $table->dropIndex(['user_id']);
            $table->dropColumn([
                'ip_address',
                'user_agent',
                'device',
                'platform',
                'browser',
                'old_values',
                'new_values',
            ]);
        });
    }
};
