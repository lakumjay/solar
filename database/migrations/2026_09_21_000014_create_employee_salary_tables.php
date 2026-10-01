<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_salary_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('effective_month');
            $table->decimal('monthly_salary', 12, 2);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['employee_id', 'effective_month'], 'salary_rate_employee_month_unique');
            $table->index(['effective_month', 'employee_id'], 'salary_rate_month_employee_index');
        });

        Schema::create('salary_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('salary_month');
            $table->string('type', 20);
            $table->decimal('amount', 12, 2);
            $table->text('reason');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('cancellation_reason')->nullable();
            $table->foreignId('replaces_adjustment_id')->nullable()->constrained('salary_adjustments')->nullOnDelete();
            $table->timestamps();
            $table->index(['employee_id', 'salary_month'], 'salary_adjustment_employee_month_index');
            $table->index(['salary_month', 'cancelled_at'], 'salary_adjustment_month_status_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('salary_adjustments');
        Schema::dropIfExists('employee_salary_rates');
    }
};
