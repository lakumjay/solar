<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('shared_expenses')) {
            Schema::table('shared_expenses', function (Blueprint $table) {
                if (! Schema::hasColumn('shared_expenses', 'allocation_scope')) {
                    $table->string('allocation_scope', 50)->default('all')->after('entry_type');
                }
            });
        }

        if (Schema::hasTable('shared_expense_allocations')) {
            Schema::table('shared_expense_allocations', function (Blueprint $table) {
                if (! Schema::hasColumn('shared_expense_allocations', 'amount_paid')) {
                    $table->decimal('amount_paid', 15, 2)->default(0)->after('share_amount');
                }
            });

            // Backfill existing allocations: set amount_paid = expense.amount for the payer company
            DB::statement('
                UPDATE shared_expense_allocations sea
                JOIN shared_expenses se ON sea.shared_expense_id = se.id
                SET sea.amount_paid = CASE WHEN sea.company_id = se.payer_company_id THEN se.amount ELSE 0 END
                WHERE sea.amount_paid = 0
            ');
        }

        if (Schema::hasTable('expense_settlements')) {
            Schema::table('expense_settlements', function (Blueprint $table) {
                if (! Schema::hasColumn('expense_settlements', 'settlement_type')) {
                    $table->string('settlement_type', 30)->default('full')->after('amount');
                }
                if (! Schema::hasColumn('expense_settlements', 'remaining_balance')) {
                    $table->decimal('remaining_balance', 15, 2)->nullable()->after('settlement_type');
                }
                if (! Schema::hasColumn('expense_settlements', 'payment_mode')) {
                    $table->string('payment_mode', 50)->nullable()->default('bank_transfer')->after('remaining_balance');
                }
                if (! Schema::hasColumn('expense_settlements', 'settled_at')) {
                    $table->timestamp('settled_at')->nullable()->after('settled_on');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('shared_expenses') && Schema::hasColumn('shared_expenses', 'allocation_scope')) {
            Schema::table('shared_expenses', function (Blueprint $table) {
                $table->dropColumn('allocation_scope');
            });
        }

        if (Schema::hasTable('shared_expense_allocations') && Schema::hasColumn('shared_expense_allocations', 'amount_paid')) {
            Schema::table('shared_expense_allocations', function (Blueprint $table) {
                $table->dropColumn('amount_paid');
            });
        }

        if (Schema::hasTable('expense_settlements')) {
            Schema::table('expense_settlements', function (Blueprint $table) {
                $cols = array_filter(['settlement_type', 'remaining_balance', 'payment_mode', 'settled_at'], fn ($c) => Schema::hasColumn('expense_settlements', $c));
                if (! empty($cols)) {
                    $table->dropColumn($cols);
                }
            });
        }
    }
};
