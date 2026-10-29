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
        Schema::table('solar_bills', function (Blueprint $table) {
            $table->decimal('interest_waived', 12, 2)->default(0)->after('interest_days');
            $table->text('interest_waive_reason')->nullable()->after('interest_waived');
            $table->foreignId('interest_waived_by')->nullable()->after('interest_waive_reason')->constrained('users')->nullOnDelete();
            $table->dateTime('interest_waived_at')->nullable()->after('interest_waived_by');
            $table->string('prev_invoice_no')->nullable()->after('prev_balance');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('solar_bills', function (Blueprint $table) {
            $table->dropForeign(['interest_waived_by']);
            $table->dropColumn([
                'interest_waived',
                'interest_waive_reason',
                'interest_waived_by',
                'interest_waived_at',
                'prev_invoice_no',
            ]);
        });
    }
};
