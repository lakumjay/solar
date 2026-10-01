<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_items', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150)->unique();
            $table->string('image_path');
            $table->decimal('unit_price', 15, 2)->default(0);
            $table->decimal('total_quantity', 15, 2)->default(0);
            $table->decimal('low_stock_threshold', 15, 2)->default(0);
            $table->text('notes')->nullable();
            $table->boolean('active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['active', 'name']);
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->string('type', 30);
            $table->decimal('quantity', 15, 2);
            $table->decimal('unit_price', 15, 2)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['stock_item_id', 'created_at']);
        });

        Schema::create('stock_borrowings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_id')->constrained()->restrictOnDelete();
            $table->string('borrower_name', 150);
            $table->string('borrower_mobile', 30)->nullable();
            $table->decimal('quantity', 15, 2);
            $table->decimal('returned_quantity', 15, 2)->default(0);
            $table->date('borrowed_on');
            $table->date('expected_return_date')->nullable();
            $table->foreignId('given_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 30)->default('pending');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['status', 'borrowed_on']);
            $table->index(['stock_item_id', 'status']);
        });

        Schema::create('stock_returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_borrowing_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 15, 2);
            $table->date('returned_on');
            $table->foreignId('received_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['stock_borrowing_id', 'returned_on']);
        });

        $defaults = [
            'company_admin' => ['view_dashboard', 'enter_readings', 'edit_readings', 'view_reports', 'manage_company_users', 'view_employees', 'manage_employees', 'view_attendance', 'approve_leaves', 'manage_attendance_settings', 'view_attendance_reports'],
            'manager' => ['view_employees', 'view_attendance', 'approve_leaves', 'view_attendance_reports'],
        ];
        $stockPermissions = ['view_stock', 'manage_stock', 'issue_stock', 'return_stock'];
        DB::table('users')->whereIn('role', array_keys($defaults))->get(['id', 'role', 'permissions'])->each(function ($user) use ($defaults, $stockPermissions) {
            $permissions = $user->permissions ? json_decode($user->permissions, true) : $defaults[$user->role];
            DB::table('users')->where('id', $user->id)->update([
                'permissions' => json_encode(array_values(array_unique([...($permissions ?: []), ...$stockPermissions]))),
            ]);
        });
    }

    public function down(): void
    {
        $stockPermissions = ['view_stock', 'manage_stock', 'issue_stock', 'return_stock'];
        DB::table('users')->whereNotNull('permissions')->get(['id', 'permissions'])->each(function ($user) use ($stockPermissions) {
            $permissions = json_decode($user->permissions, true) ?: [];
            DB::table('users')->where('id', $user->id)->update([
                'permissions' => json_encode(array_values(array_diff($permissions, $stockPermissions))),
            ]);
        });

        Schema::dropIfExists('stock_returns');
        Schema::dropIfExists('stock_borrowings');
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('stock_items');
    }
};
