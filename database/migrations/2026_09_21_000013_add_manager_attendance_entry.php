<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->boolean('manager_attendance_only')->default(false)->after('active');
        });

        Schema::table('attendance_records', function (Blueprint $table) {
            $table->decimal('clock_in_latitude', 10, 7)->nullable()->change();
            $table->decimal('clock_in_longitude', 10, 7)->nullable()->change();
            $table->string('selfie_path')->nullable()->change();
            $table->string('entry_source', 30)->default('employee')->after('selfie_path');
            $table->foreignId('recorded_by')->nullable()->after('entry_source')->constrained('users')->nullOnDelete();
            $table->text('entry_reason')->nullable()->after('recorded_by');
            $table->index(['entry_source', 'attendance_date'], 'attendance_source_date_idx');
        });

        DB::table('users')
            ->whereIn('role', ['company_admin', 'manager'])
            ->whereNotNull('permissions')
            ->get(['id', 'permissions'])
            ->each(function ($user) {
                $permissions = json_decode($user->permissions, true) ?: [];
                DB::table('users')->where('id', $user->id)->update([
                    'permissions' => json_encode(array_values(array_unique([...$permissions, 'record_employee_attendance']))),
                ]);
            });
    }

    public function down(): void
    {
        DB::table('users')
            ->whereNotNull('permissions')
            ->get(['id', 'permissions'])
            ->each(function ($user) {
                $permissions = json_decode($user->permissions, true) ?: [];
                DB::table('users')->where('id', $user->id)->update([
                    'permissions' => json_encode(array_values(array_diff($permissions, ['record_employee_attendance']))),
                ]);
            });

        DB::table('attendance_records')->whereNull('clock_in_latitude')->update([
            'clock_in_latitude' => 0,
            'clock_in_longitude' => 0,
            'selfie_path' => '',
        ]);

        Schema::table('attendance_records', function (Blueprint $table) {
            $table->dropIndex('attendance_source_date_idx');
            $table->dropConstrainedForeignId('recorded_by');
            $table->dropColumn(['entry_source', 'entry_reason']);
            $table->decimal('clock_in_latitude', 10, 7)->nullable(false)->change();
            $table->decimal('clock_in_longitude', 10, 7)->nullable(false)->change();
            $table->string('selfie_path')->nullable(false)->change();
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('manager_attendance_only');
        });
    }
};
