<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('activity_logs')) {
            return;
        }

        Schema::table('activity_logs', function (Blueprint $table) {
            if (! Schema::hasColumn('activity_logs', 'ip_address')) {
                $table->string('ip_address', 45)->nullable()->after('description');
            }
            if (! Schema::hasColumn('activity_logs', 'user_agent')) {
                $table->text('user_agent')->nullable();
            }
            if (! Schema::hasColumn('activity_logs', 'device')) {
                $table->string('device', 100)->nullable();
            }
            if (! Schema::hasColumn('activity_logs', 'platform')) {
                $table->string('platform', 60)->nullable();
            }
            if (! Schema::hasColumn('activity_logs', 'browser')) {
                $table->string('browser', 60)->nullable();
            }
            if (! Schema::hasColumn('activity_logs', 'old_values')) {
                $table->json('old_values')->nullable();
            }
            if (! Schema::hasColumn('activity_logs', 'new_values')) {
                $table->json('new_values')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('activity_logs')) {
            return;
        }

        Schema::table('activity_logs', function (Blueprint $table) {
            $cols = array_filter([
                'ip_address',
                'user_agent',
                'device',
                'platform',
                'browser',
                'old_values',
                'new_values',
            ], fn ($c) => Schema::hasColumn('activity_logs', $c));
            if (! empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};
