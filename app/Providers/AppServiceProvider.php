<?php

namespace App\Providers;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->ensureDatabaseSchemaUpToDate();
    }

    /**
     * Automatically heal missing columns if migrations were not run on production server.
     */
    private function ensureDatabaseSchemaUpToDate(): void
    {
        try {
            if (Cache::get('solar_schema_healed_v2')) {
                return;
            }

            // 1. attendance_breaks columns (Regular Break & Urgent Out)
            if (Schema::hasTable('attendance_breaks') && ! Schema::hasColumn('attendance_breaks', 'break_type')) {
                Schema::table('attendance_breaks', function (Blueprint $table) {
                    if (! Schema::hasColumn('attendance_breaks', 'break_type')) {
                        $table->string('break_type')->default('regular');
                    }
                    if (! Schema::hasColumn('attendance_breaks', 'out_reason')) {
                        $table->string('out_reason')->nullable();
                    }
                    if (! Schema::hasColumn('attendance_breaks', 'out_selfie_path')) {
                        $table->string('out_selfie_path')->nullable();
                    }
                    if (! Schema::hasColumn('attendance_breaks', 'deduction_amount')) {
                        $table->decimal('deduction_amount', 10, 2)->default(0.00);
                    }
                    if (! Schema::hasColumn('attendance_breaks', 'is_deducted')) {
                        $table->boolean('is_deducted')->default(false);
                    }
                    if (! Schema::hasColumn('attendance_breaks', 'admin_waived')) {
                        $table->boolean('admin_waived')->default(false);
                    }
                    if (! Schema::hasColumn('attendance_breaks', 'waive_reason')) {
                        $table->string('waive_reason')->nullable();
                    }
                });
            }

            // 2. activity_logs columns (Device, IP, Browser)
            if (Schema::hasTable('activity_logs') && ! Schema::hasColumn('activity_logs', 'ip_address')) {
                Schema::table('activity_logs', function (Blueprint $table) {
                    if (! Schema::hasColumn('activity_logs', 'ip_address')) {
                        $table->string('ip_address', 45)->nullable();
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

            Cache::put('solar_schema_healed_v2', true, 86400);
        } catch (\Throwable $e) {
            // Ignore during CLI bootstrap before DB is ready
        }
    }
}
