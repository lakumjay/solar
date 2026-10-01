<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->unsignedInteger('break_minutes')->default(0)->after('work_minutes');
        });

        Schema::create('attendance_breaks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_record_id')->constrained()->cascadeOnDelete();
            $table->dateTime('started_at');
            $table->dateTime('ended_at')->nullable();
            $table->unsignedInteger('duration_minutes')->default(0);
            $table->timestamps();
            $table->index(['attendance_record_id', 'ended_at']);
        });

        $generalLeaveId = DB::table('leave_types')->where('name', 'General Leave')->value('id');
        if (! $generalLeaveId) {
            $generalLeaveId = DB::table('leave_types')->insertGetId([
                'name' => 'General Leave',
                'paid' => true,
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        DB::table('leave_requests')->update(['leave_type_id' => $generalLeaveId]);
        DB::table('leave_types')->where('id', '!=', $generalLeaveId)->delete();
        DB::table('employees')->whereNull('weekly_offs')->update(['weekly_offs' => json_encode([])]);

        DB::table('users')->where('role', 'employee')->get(['id', 'permissions'])->each(function ($user) {
            $permissions = json_decode($user->permissions ?: '[]', true) ?: [];
            $permissions = array_values(array_unique([...$permissions, 'clock_attendance', 'enter_readings']));
            DB::table('users')->where('id', $user->id)->update(['permissions' => json_encode($permissions)]);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_breaks');
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->dropColumn('break_minutes');
        });
    }
};
