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
        if (! Schema::hasTable('attendance_breaks')) {
            return;
        }

        Schema::table('attendance_breaks', function (Blueprint $table) {
            if (! Schema::hasColumn('attendance_breaks', 'break_type')) {
                $table->string('break_type')->default('regular')->after('attendance_record_id');
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

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasTable('attendance_breaks')) {
            return;
        }

        Schema::table('attendance_breaks', function (Blueprint $table) {
            $cols = array_filter([
                'break_type',
                'out_reason',
                'out_selfie_path',
                'deduction_amount',
                'is_deducted',
                'admin_waived',
                'waive_reason',
            ], fn ($c) => Schema::hasColumn('attendance_breaks', $c));
            if (! empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};
