<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('companies', 'expense_percentage')) {
            Schema::table('companies', function (Blueprint $table) {
                $table->decimal('expense_percentage', 5, 2)->default(0)->after('sub_export_multiplier');
            });
        }

        if (! Schema::hasTable('shared_expenses')) {
            Schema::create('shared_expenses', function (Blueprint $table) {
                $table->id();
                $table->date('expense_date');
                $table->foreignId('payer_company_id')->constrained('companies')->restrictOnDelete();
                $table->string('purchaser_name', 150);
                $table->string('description', 255);
                $table->decimal('amount', 15, 2);
                $table->text('notes')->nullable();
                $table->string('receipt_path')->nullable();
                $table->string('entry_type', 30)->default('expense');
                $table->string('status', 30)->default('active');
                $table->foreignId('reverses_expense_id')->nullable()->constrained('shared_expenses')->nullOnDelete();
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

        if (! Schema::hasTable('shared_expense_allocations')) {
            Schema::create('shared_expense_allocations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('shared_expense_id')->constrained()->cascadeOnDelete();
                $table->foreignId('company_id')->constrained()->restrictOnDelete();
                $table->decimal('percentage', 5, 2);
                $table->decimal('share_amount', 15, 2);
                $table->timestamps();
                $table->unique(['shared_expense_id', 'company_id']);
                $table->index(['company_id', 'shared_expense_id']);
            });
        }

        if (! Schema::hasTable('expense_settlements')) {
            Schema::create('expense_settlements', function (Blueprint $table) {
                $table->id();
                $table->date('settled_on');
                $table->foreignId('from_company_id')->constrained('companies')->restrictOnDelete();
                $table->foreignId('to_company_id')->constrained('companies')->restrictOnDelete();
                $table->decimal('amount', 15, 2);
                $table->text('notes')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(
                    ['settled_on', 'from_company_id', 'to_company_id'],
                    'expense_settlements_pair_date_idx'
                );
            });
        } elseif (! Schema::hasIndex('expense_settlements', ['settled_on', 'from_company_id', 'to_company_id'])) {
            Schema::table('expense_settlements', function (Blueprint $table) {
                $table->index(
                    ['settled_on', 'from_company_id', 'to_company_id'],
                    'expense_settlements_pair_date_idx'
                );
            });
        }

        $defaults = [
            'company_admin' => ['view_dashboard', 'enter_readings', 'edit_readings', 'view_reports', 'manage_company_users', 'view_employees', 'manage_employees', 'view_attendance', 'approve_leaves', 'manage_attendance_settings', 'view_attendance_reports', 'view_stock', 'manage_stock', 'issue_stock', 'return_stock'],
            'manager' => ['view_employees', 'view_attendance', 'approve_leaves', 'view_attendance_reports', 'view_stock', 'manage_stock', 'issue_stock', 'return_stock'],
            'data_entry' => ['view_dashboard', 'enter_readings', 'edit_readings', 'view_reports'],
            'viewer' => ['view_dashboard', 'view_reports'],
        ];
        DB::table('users')
            ->whereNotNull('company_id')
            ->where('role', '!=', 'employee')
            ->get(['id', 'role', 'permissions'])
            ->each(function ($user) use ($defaults) {
                $permissions = $user->permissions ? json_decode($user->permissions, true) : ($defaults[$user->role] ?? []);
                DB::table('users')->where('id', $user->id)->update([
                    'permissions' => json_encode(array_values(array_unique([...($permissions ?: []), 'view_expenses']))),
                ]);
            });
    }

    public function down(): void
    {
        DB::table('users')->whereNotNull('permissions')->get(['id', 'permissions'])->each(function ($user) {
            $permissions = json_decode($user->permissions, true) ?: [];
            DB::table('users')->where('id', $user->id)->update([
                'permissions' => json_encode(array_values(array_diff($permissions, ['view_expenses']))),
            ]);
        });

        Schema::dropIfExists('expense_settlements');
        Schema::dropIfExists('shared_expense_allocations');
        Schema::dropIfExists('shared_expenses');
        if (Schema::hasColumn('companies', 'expense_percentage')) {
            Schema::table('companies', fn (Blueprint $table) => $table->dropColumn('expense_percentage'));
        }
    }
};
