<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('solar_curtailments')) {
            Schema::create('solar_curtailments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->integer('percentage')->default(20);
                $table->string('status')->default('active'); // active | completed | cancelled
                $table->json('inverter_ids')->nullable();
                $table->json('pv_strings')->nullable();
                $table->json('step_history')->nullable();
                $table->timestamp('started_at')->useCurrent();
                $table->timestamp('ended_at')->nullable();
                $table->integer('duration_minutes')->default(0);
                $table->decimal('total_lost_kwh', 10, 2)->default(0.00);
                $table->decimal('total_lost_revenue_rs', 10, 2)->default(0.00);
                $table->string('notes')->nullable();
                $table->timestamps();

                $table->index(['company_id', 'status']);
                $table->index('started_at');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('solar_curtailments');
    }
};
