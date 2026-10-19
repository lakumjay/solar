<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. RNSK Companies & Dynamic % Allocation Table
        if (! Schema::hasTable('rnsk_companies')) {
            Schema::create('rnsk_companies', function (Blueprint $table) {
                $table->id();
                $table->string('name', 150);
                $table->decimal('expense_percentage', 5, 2)->default(0.00);
                $table->boolean('active')->default(true);
                $table->unsignedInteger('display_order')->default(0);
                $table->timestamps();
            });
        }

        // 2. RNSK Expenses Master Table
        if (! Schema::hasTable('rnsk_expenses')) {
            Schema::create('rnsk_expenses', function (Blueprint $table) {
                $table->id();
                $table->date('expense_date');
                $table->foreignId('payer_company_id')->constrained('rnsk_companies')->restrictOnDelete();
                $table->string('purchaser_name', 150);
                $table->string('description', 255);
                $table->decimal('amount', 15, 2);
                $table->text('notes')->nullable();
                $table->string('receipt_path')->nullable();
                $table->string('entry_type', 30)->default('expense'); // expense, reversal
                $table->string('status', 30)->default('active'); // active, cancelled
                $table->foreignId('reverses_expense_id')->nullable()->constrained('rnsk_expenses')->nullOnDelete();
                $table->timestamp('locked_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['expense_date', 'status']);
                $table->index(['payer_company_id', 'expense_date']);
            });
        }

        // 3. RNSK Expense Allocations Table (Split according to dynamic company %)
        if (! Schema::hasTable('rnsk_expense_allocations')) {
            Schema::create('rnsk_expense_allocations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('rnsk_expense_id')->constrained('rnsk_expenses')->cascadeOnDelete();
                $table->foreignId('rnsk_company_id')->constrained('rnsk_companies')->restrictOnDelete();
                $table->decimal('percentage', 5, 2)->default(0.00);
                $table->decimal('share_amount', 15, 2)->default(0.00);
                $table->decimal('amount_paid', 15, 2)->default(0.00);
                $table->timestamps();

                $table->unique(['rnsk_expense_id', 'rnsk_company_id'], 'rnsk_exp_comp_unique');
                $table->index(['rnsk_company_id', 'rnsk_expense_id'], 'rnsk_comp_exp_idx');
            });
        }

        // 4. RNSK Expense Settlements Table
        if (! Schema::hasTable('rnsk_expense_settlements')) {
            Schema::create('rnsk_expense_settlements', function (Blueprint $table) {
                $table->id();
                $table->date('settled_on');
                $table->timestamp('settled_at')->nullable();
                $table->foreignId('from_company_id')->constrained('rnsk_companies')->restrictOnDelete();
                $table->foreignId('to_company_id')->constrained('rnsk_companies')->restrictOnDelete();
                $table->decimal('amount', 15, 2);
                $table->string('settlement_type', 30)->default('full'); // full, partial
                $table->decimal('remaining_balance', 15, 2)->nullable();
                $table->string('payment_mode', 50)->nullable()->default('bank_transfer');
                $table->string('payment_reference', 100)->nullable();
                $table->string('receipt_path')->nullable();
                $table->text('notes')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['settled_on', 'from_company_id', 'to_company_id'], 'rnsk_settle_date_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('rnsk_expense_settlements');
        Schema::dropIfExists('rnsk_expense_allocations');
        Schema::dropIfExists('rnsk_expenses');
        Schema::dropIfExists('rnsk_companies');
    }
};
