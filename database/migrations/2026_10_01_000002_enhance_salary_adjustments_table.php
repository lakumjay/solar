<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('salary_adjustments')) {
            Schema::table('salary_adjustments', function (Blueprint $table) {
                if (! Schema::hasColumn('salary_adjustments', 'work_date')) {
                    $table->date('work_date')->nullable()->after('salary_month');
                }
                if (! Schema::hasColumn('salary_adjustments', 'company_id')) {
                    $table->foreignId('company_id')->nullable()->after('reason')->constrained('companies')->nullOnDelete();
                }
                if (! Schema::hasColumn('salary_adjustments', 'add_to_shared_expenses')) {
                    $table->boolean('add_to_shared_expenses')->default(false)->after('company_id');
                }
                if (! Schema::hasColumn('salary_adjustments', 'shared_expense_id')) {
                    $table->foreignId('shared_expense_id')->nullable()->after('add_to_shared_expenses')->constrained('shared_expenses')->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('salary_adjustments')) {
            Schema::table('salary_adjustments', function (Blueprint $table) {
                $cols = array_filter(['work_date', 'company_id', 'add_to_shared_expenses', 'shared_expense_id'], fn ($c) => Schema::hasColumn('salary_adjustments', $c));
                if (! empty($cols)) {
                    $table->dropForeign(['company_id']);
                    $table->dropForeign(['shared_expense_id']);
                    $table->dropColumn($cols);
                }
            });
        }
    }
};
