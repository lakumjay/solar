<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('inverter_maintenance_logs')) {
            Schema::create('inverter_maintenance_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
                $table->foreignId('inverter_id')->nullable()->constrained('inverters')->nullOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('maintenance_type')->default('fan_dust_cleaning'); // fan_dust_cleaning | air_filter | canopy_check
                $table->timestamp('cleaned_at')->useCurrent();
                $table->date('next_due_date')->nullable();
                $table->string('performed_by_name')->nullable();
                $table->string('notes')->nullable();
                $table->timestamps();

                $table->index(['maintenance_type', 'cleaned_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('inverter_maintenance_logs');
    }
};
