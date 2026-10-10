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
        Schema::table('attendance_breaks', function (Blueprint $table) {
            $table->string('break_type')->default('regular')->after('attendance_record_id'); // 'regular' or 'urgent_out'
            $table->string('out_reason')->nullable()->after('break_type');
            $table->string('out_selfie_path')->nullable()->after('out_reason');
            $table->decimal('deduction_amount', 10, 2)->default(0.00)->after('duration_minutes');
            $table->boolean('is_deducted')->default(false)->after('deduction_amount');
            $table->boolean('admin_waived')->default(false)->after('is_deducted');
            $table->string('waive_reason')->nullable()->after('admin_waived');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('attendance_breaks', function (Blueprint $table) {
            $table->dropColumn([
                'break_type',
                'out_reason',
                'out_selfie_path',
                'deduction_amount',
                'is_deducted',
                'admin_waived',
                'waive_reason',
            ]);
        });
    }
};
