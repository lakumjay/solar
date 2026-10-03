<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('plant_photo_tasks')) {
            Schema::create('plant_photo_tasks', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->time('start_time');
                $table->time('end_time');
                $table->unsignedSmallInteger('required_photos')->default(1);
                $table->text('description')->nullable();
                $table->foreignId('company_id')->nullable()->constrained('companies')->nullOnDelete();
                $table->boolean('active')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('plant_photos')) {
            Schema::create('plant_photos', function (Blueprint $table) {
                $table->id();
                $table->foreignId('task_id')->nullable()->constrained('plant_photo_tasks')->nullOnDelete();
                $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
                $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
                $table->string('photo_path');
                $table->timestamp('captured_at');
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->string('address')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index(['captured_at', 'company_id']);
            });
        }

        // Seed Default 4-Slot Time-Table (10 Photos Total) if empty
        if (DB::table('plant_photo_tasks')->count() === 0) {
            DB::table('plant_photo_tasks')->insert([
                [
                    'title' => 'Morning Inverter & Combiner Box Check',
                    'start_time' => '11:00:00',
                    'end_time' => '12:00:00',
                    'required_photos' => 2,
                    'description' => 'Morning inspection of plant inverters, ACDB/DCDB boxes, and generation flow.',
                    'company_id' => null,
                    'active' => true,
                    'sort_order' => 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'title' => 'Noon Solar Tables & Panel Soiling Inspection',
                    'start_time' => '13:00:00',
                    'end_time' => '14:00:00',
                    'required_photos' => 3,
                    'description' => 'Peak sunshine check on solar tables, dust/soiling condition, and physical array integrity.',
                    'company_id' => null,
                    'active' => true,
                    'sort_order' => 2,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'title' => 'Afternoon Substation & Metering Inspection',
                    'start_time' => '15:00:00',
                    'end_time' => '16:00:00',
                    'required_photos' => 3,
                    'description' => 'Substation transformer, earthing points, grid connection, and transmission line visual check.',
                    'company_id' => null,
                    'active' => true,
                    'sort_order' => 3,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'title' => 'EOD Sunset Plant Overview & Security Check',
                    'start_time' => '17:00:00',
                    'end_time' => '18:00:00',
                    'required_photos' => 2,
                    'description' => 'End of day closing overview of all 3 plants, control room, and perimeter security.',
                    'company_id' => null,
                    'active' => true,
                    'sort_order' => 4,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('plant_photos');
        Schema::dropIfExists('plant_photo_tasks');
    }
};
