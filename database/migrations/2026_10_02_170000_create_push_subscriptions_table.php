<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('push_subscriptions')) {
            Schema::create('push_subscriptions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
                $table->text('endpoint');
                $table->string('endpoint_hash', 64)->index();
                $table->text('public_key')->nullable();
                $table->text('auth_token')->nullable();
                $table->string('content_encoding')->default('aesgcm');
                $table->text('user_agent')->nullable();
                $table->timestamp('last_active_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }
};
