<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('employee_code', 50)->unique();
            $table->string('mobile', 30)->nullable();
            $table->string('designation', 100)->nullable();
            $table->string('department', 100)->nullable();
            $table->date('joining_date')->nullable();
            $table->boolean('active')->default(true);
            $table->time('shift_start')->default('09:00:00');
            $table->time('shift_end')->default('18:00:00');
            $table->unsignedInteger('working_minutes')->default(480);
            $table->unsignedInteger('half_day_minutes')->default(240);
            $table->unsignedInteger('grace_minutes')->default(15);
            $table->json('weekly_offs')->nullable();
            $table->string('profile_photo_path')->nullable();
            $table->timestamps();
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->date('holiday_date')->unique();
            $table->string('type', 20)->default('full_day');
            $table->boolean('active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('leave_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80)->unique();
            $table->boolean('paid')->default(true);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('attendance_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('attendance_date');
            $table->dateTime('clock_in_at');
            $table->decimal('clock_in_latitude', 10, 7);
            $table->decimal('clock_in_longitude', 10, 7);
            $table->decimal('clock_in_accuracy', 10, 2)->nullable();
            $table->string('selfie_path');
            $table->dateTime('clock_out_at')->nullable();
            $table->decimal('clock_out_latitude', 10, 7)->nullable();
            $table->decimal('clock_out_longitude', 10, 7)->nullable();
            $table->decimal('clock_out_accuracy', 10, 2)->nullable();
            $table->text('work_done')->nullable();
            $table->text('learned')->nullable();
            $table->string('status', 30)->default('open');
            $table->unsignedInteger('work_minutes')->default(0);
            $table->boolean('is_late')->default(false);
            $table->boolean('is_early_out')->default(false);
            $table->unsignedInteger('overtime_minutes')->default(0);
            $table->boolean('manual_correction')->default(false);
            $table->text('correction_reason')->nullable();
            $table->foreignId('corrected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('corrected_at')->nullable();
            $table->timestamps();
            $table->unique(['employee_id', 'attendance_date']);
            $table->index(['attendance_date', 'status']);
        });

        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('leave_type_id')->constrained()->restrictOnDelete();
            $table->date('date_from');
            $table->date('date_to');
            $table->string('day_part', 20)->default('full_day');
            $table->text('reason');
            $table->string('attachment_path')->nullable();
            $table->string('status', 20)->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->text('review_remarks')->nullable();
            $table->timestamps();
            $table->index(['status', 'date_from', 'date_to']);
        });

        Schema::create('attendance_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_record_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->json('old_values');
            $table->json('new_values');
            $table->text('reason');
            $table->timestamp('created_at')->useCurrent();
        });

        DB::table('leave_types')->insert([
            ['name' => 'Annual Leave', 'paid' => true, 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Sick Leave', 'paid' => true, 'active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Unpaid Leave', 'paid' => false, 'active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $companyAdminDefaults = ['view_dashboard', 'enter_readings', 'edit_readings', 'view_reports', 'manage_company_users', 'view_employees', 'manage_employees', 'view_attendance', 'approve_leaves', 'manage_attendance_settings', 'view_attendance_reports'];
        DB::table('users')->where('role', 'company_admin')->get(['id', 'permissions'])->each(function ($user) use ($companyAdminDefaults) {
            $existing = json_decode($user->permissions ?: '[]', true) ?: [];
            DB::table('users')->where('id', $user->id)->update(['permissions' => json_encode(array_values(array_unique([...$existing, ...$companyAdminDefaults])))]);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_adjustments');
        Schema::dropIfExists('leave_requests');
        Schema::dropIfExists('attendance_records');
        Schema::dropIfExists('leave_types');
        Schema::dropIfExists('holidays');
        Schema::dropIfExists('employees');
    }
};
