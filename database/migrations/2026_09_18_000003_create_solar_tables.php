<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->decimal('plant_import_multiplier', 12, 4)->default(600);
            $table->decimal('plant_export_multiplier', 12, 4)->default(600);
            $table->decimal('sub_import_multiplier', 12, 4)->default(5000);
            $table->decimal('sub_export_multiplier', 12, 4)->default(5000);
            $table->timestamps();
        });
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('company_id')->nullable()->after('id')->constrained()->nullOnDelete();
            $table->string('role')->default('data_entry')->after('password');
        });
        Schema::create('inverters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
        Schema::create('daily_readings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->date('reading_date');
            $table->decimal('plant_import_reading', 16, 4)->nullable();
            $table->decimal('plant_import_unit', 16, 2)->nullable();
            $table->decimal('plant_export_reading', 16, 4)->nullable();
            $table->decimal('plant_export_unit', 16, 2)->nullable();
            $table->decimal('sub_import_reading', 16, 4)->nullable();
            $table->decimal('sub_import_unit', 16, 2)->nullable();
            $table->decimal('sub_export_reading', 16, 4)->nullable();
            $table->decimal('sub_export_unit', 16, 2)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['company_id', 'reading_date']);
        });
        Schema::create('daily_inverter_outputs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('daily_reading_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inverter_id')->constrained()->cascadeOnDelete();
            $table->decimal('generation', 16, 2);
            $table->timestamps();
            $table->unique(['daily_reading_id', 'inverter_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_inverter_outputs');
        Schema::dropIfExists('daily_readings');
        Schema::dropIfExists('inverters');
        Schema::table('users', fn (Blueprint $t) => $t->dropConstrainedForeignId('company_id'));
        Schema::dropIfExists('companies');
    }
};
