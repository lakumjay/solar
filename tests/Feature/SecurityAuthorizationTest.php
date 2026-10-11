<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Employee;
use App\Models\Inverter;
use App\Models\PlantPhotoTask;
use App\Models\SolarCurtailment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SecurityAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_normal_employee_cannot_store_or_modify_solar_curtailment(): void
    {
        $company = Company::create(['name' => 'Sunrise Solar', 'active' => true]);
        $employeeUser = User::factory()->create(['role' => 'employee', 'company_id' => null]);

        $this->actingAs($employeeUser)
            ->postJson('/api/curtailments', [
                'company_id' => $company->id,
                'percentage' => 40,
            ])
            ->assertForbidden();

        $this->actingAs($employeeUser)
            ->postJson('/api/curtailments/restore-all', [
                'company_id' => $company->id,
            ])
            ->assertForbidden();
    }

    public function test_company_admin_cannot_curtail_another_company_plant(): void
    {
        $ownCompany = Company::create(['name' => 'Own Solar', 'active' => true]);
        $otherCompany = Company::create(['name' => 'Other Solar', 'active' => true]);
        $admin = User::factory()->create(['role' => 'company_admin', 'company_id' => $ownCompany->id]);

        $this->actingAs($admin)
            ->postJson('/api/curtailments', [
                'company_id' => $otherCompany->id,
                'percentage' => 50,
            ])
            ->assertForbidden();

        $curtailment = SolarCurtailment::create([
            'company_id' => $otherCompany->id,
            'percentage' => 40,
            'status' => 'active',
            'started_at' => Carbon::now(),
        ]);

        $this->actingAs($admin)
            ->deleteJson("/api/curtailments/{$curtailment->id}")
            ->assertForbidden();
    }

    public function test_non_super_admin_cannot_create_or_delete_plant_photo_tasks(): void
    {
        $company = Company::create(['name' => 'Solar Alpha', 'active' => true]);
        $companyAdmin = User::factory()->create(['role' => 'company_admin', 'company_id' => $company->id]);
        $employee = User::factory()->create(['role' => 'employee', 'company_id' => null]);

        // Company admin cannot save photo task
        $this->actingAs($companyAdmin)
            ->postJson('/api/plant-photos/tasks', [
                'title' => 'Inverter Inspection',
                'start_time' => '11:00',
                'end_time' => '12:00',
                'required_photos' => 2,
            ])
            ->assertForbidden();

        // Employee cannot save photo task
        $this->actingAs($employee)
            ->postJson('/api/plant-photos/tasks', [
                'title' => 'Panel Cleaning Check',
                'start_time' => '14:00',
                'end_time' => '15:00',
                'required_photos' => 1,
            ])
            ->assertForbidden();

        $task = PlantPhotoTask::create([
            'title' => 'Morning Slot',
            'start_time' => '09:00',
            'end_time' => '10:00',
            'required_photos' => 1,
            'is_active' => true,
        ]);

        // Company admin cannot delete photo task
        $this->actingAs($companyAdmin)
            ->deleteJson("/api/plant-photos/tasks/{$task->id}")
            ->assertForbidden();
    }

    public function test_user_without_active_employee_profile_cannot_upload_plant_photos(): void
    {
        Storage::fake('public');
        $company = Company::create(['name' => 'Solar Plant Beta', 'active' => true]);
        $userWithoutEmployee = User::factory()->create([
            'role' => 'company_admin',
            'company_id' => $company->id,
        ]);

        $photo = UploadedFile::fake()->image('inverter.jpg');

        $this->actingAs($userWithoutEmployee)
            ->postJson('/api/plant-photos/upload', [
                'photo' => $photo,
                'company_id' => $company->id,
            ])
            ->assertForbidden();
    }

    public function test_user_with_active_employee_profile_can_upload_plant_photos(): void
    {
        Storage::fake('public');
        $company = Company::create(['name' => 'Solar Plant Gamma', 'active' => true]);
        $employeeUser = User::factory()->create([
            'role' => 'employee',
            'company_id' => null,
        ]);
        Employee::create([
            'user_id' => $employeeUser->id,
            'employee_code' => 'EMP-SEC-01',
            'joining_date' => '2026-01-01',
            'active' => true,
            'shift_start' => '09:00',
            'shift_end' => '18:00',
            'working_minutes' => 480,
            'half_day_minutes' => 240,
            'grace_minutes' => 15,
        ]);

        $photo = UploadedFile::fake()->image('panel.jpg');

        $this->actingAs($employeeUser)
            ->postJson('/api/plant-photos/upload', [
                'photo' => $photo,
                'company_id' => $company->id,
            ])
            ->assertOk()
            ->assertJsonPath('success', true);
    }
}
