<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inverter;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdministrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_company_admin_cannot_view_or_modify_another_company_user(): void
    {
        $own = Company::create(['name' => 'Own Solar']);
        $other = Company::create(['name' => 'Other Solar']);
        $admin = User::factory()->create(['company_id' => $own->id, 'role' => 'company_admin']);
        $ownUser = User::factory()->create(['company_id' => $own->id, 'role' => 'viewer']);
        $otherUser = User::factory()->create(['company_id' => $other->id, 'role' => 'viewer']);

        $this->actingAs($admin)->getJson('/api/users')
            ->assertOk()
            ->assertJsonFragment(['id' => $ownUser->id])
            ->assertJsonMissing(['id' => $otherUser->id]);

        $this->actingAs($admin)->postJson('/api/users', [
            'id' => $otherUser->id,
            'company_id' => $other->id,
            'name' => 'Moved User',
            'email' => $otherUser->email,
            'role' => 'viewer',
            'permissions' => ['view_dashboard'],
            'active' => true,
        ])->assertForbidden();

        $this->actingAs($admin)->postJson('/api/companies', [
            'id' => $other->id,
        ])->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $otherUser->id, 'company_id' => $other->id]);
    }

    public function test_super_admin_can_create_dynamic_company_and_inverter(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'super_admin']);

        $company = $this->actingAs($admin)->post('/api/companies', [
            'name' => 'Future Green Energy',
            'admin_email' => 'admin@future-green.test',
            'password' => 'secure-password',
            'logo' => UploadedFile::fake()->image('future-green.png', 120, 120),
            'active' => true,
            'is_ss_reference' => false,
            'plant_import_multiplier' => 100,
            'plant_export_multiplier' => 200,
            'sub_import_multiplier' => 300,
            'sub_export_multiplier' => 400,
        ])->assertSuccessful()->json();

        $companyModel = Company::findOrFail($company['id']);
        $companyAdmin = User::where('email', 'admin@future-green.test')->firstOrFail();
        Storage::disk('public')->assertExists($companyModel->logo_path);
        $this->assertTrue(Hash::check('secure-password', $companyAdmin->password));
        $this->assertSame('company_admin', $companyAdmin->role);
        $this->assertSame($companyModel->id, $companyAdmin->company_id);
        $this->assertTrue($companyModel->is_ss_reference);

        $originalPassword = $companyAdmin->password;
        $this->actingAs($admin)->post('/api/companies', [
            'id' => $company['id'],
            'name' => 'Future Green Energy',
            'admin_email' => 'admin@future-green.test',
            'password' => '',
            'active' => true,
            'is_ss_reference' => true,
            'plant_import_multiplier' => 100,
            'plant_export_multiplier' => 200,
            'sub_import_multiplier' => 300,
            'sub_export_multiplier' => 400,
        ])->assertSuccessful();
        $this->assertSame($originalPassword, $companyAdmin->fresh()->password);

        $this->actingAs($admin)->postJson('/api/companies', [
            'id' => $company['id'],
            'name' => 'Future Green Energy',
            'admin_email' => 'admin@future-green.test',
            'active' => true,
            'is_ss_reference' => true,
            'plant_import_multiplier' => 100.123,
            'plant_export_multiplier' => 200,
            'sub_import_multiplier' => 300,
            'sub_export_multiplier' => 400,
        ])->assertUnprocessable()->assertJsonValidationErrors('plant_import_multiplier');

        $this->actingAs($admin)->postJson('/api/inverters', [
            'company_id' => $company['id'],
            'name' => 'Inverter 1',
            'active' => true,
        ])->assertSuccessful();

        $this->assertDatabaseHas('companies', ['name' => 'Future Green Energy', 'sub_export_multiplier' => 400]);
        $this->assertDatabaseHas('inverters', ['company_id' => $company['id'], 'name' => 'Inverter 1']);

        $this->postJson('/api/logout')->assertNoContent();
        $this->postJson('/api/login', [
            'email' => 'admin@future-green.test',
            'password' => 'secure-password',
        ])->assertOk()
            ->assertJsonPath('company_id', $company['id'])
            ->assertJsonPath('role', 'company_admin');

        $this->getJson('/api/companies')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $company['id'])
            ->assertJsonPath('0.admin_email', 'admin@future-green.test');
        $this->get($company['logo_url'])->assertOk();

        $otherCompany = Company::create(['name' => 'Other Company']);
        $otherAdmin = User::factory()->create(['company_id' => $otherCompany->id, 'role' => 'company_admin']);
        $this->actingAs($otherAdmin)->get($company['logo_url'])->assertForbidden();
    }

    public function test_super_admin_can_replace_but_not_remove_or_deactivate_the_daily_ss_reference(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'super_admin']);
        $current = Company::create(['name' => 'Sunrise Green Energy', 'is_ss_reference' => true]);
        User::factory()->create([
            'company_id' => $current->id,
            'role' => 'company_admin',
            'email' => 'sunrise-reference@example.test',
        ]);
        $replacement = Company::create(['name' => 'Rajeshwari Solar']);
        User::factory()->create([
            'company_id' => $replacement->id,
            'role' => 'company_admin',
            'email' => 'rajeshwari-reference@example.test',
        ]);

        $this->actingAs($admin)->postJson('/api/companies', $this->companyPayload($replacement, [
            'admin_email' => 'rajeshwari-reference@example.test',
            'is_ss_reference' => true,
        ]))->assertOk()->assertJsonPath('is_ss_reference', true);

        $this->assertFalse($current->fresh()->is_ss_reference);
        $this->assertTrue($replacement->fresh()->is_ss_reference);
        $this->assertSame(1, Company::where('is_ss_reference', true)->count());

        $this->actingAs($admin)->postJson('/api/companies', $this->companyPayload($replacement, [
            'admin_email' => 'rajeshwari-reference@example.test',
            'is_ss_reference' => false,
        ]))->assertUnprocessable()->assertJsonValidationErrors('is_ss_reference');

        $this->actingAs($admin)->postJson('/api/companies', $this->companyPayload($replacement, [
            'admin_email' => 'rajeshwari-reference@example.test',
            'active' => false,
            'is_ss_reference' => true,
        ]))->assertUnprocessable()->assertJsonValidationErrors('active');
    }

    public function test_viewer_cannot_enter_readings(): void
    {
        $company = Company::create(['name' => 'Viewer Solar']);
        $inverter = Inverter::create(['company_id' => $company->id, 'name' => 'Inverter 1']);
        $viewer = User::factory()->create(['company_id' => $company->id, 'role' => 'viewer']);

        $this->actingAs($viewer)->postJson('/api/readings', [
            'company_id' => $company->id,
            'reading_date' => '2026-09-18',
            'plant_import_reading' => 1,
            'plant_export_reading' => 1,
            'sub_import_reading' => 1,
            'sub_export_reading' => 1,
            'outputs' => [['inverter_id' => $inverter->id, 'generation' => 1]],
        ])->assertForbidden();
    }

    private function companyPayload(Company $company, array $overrides = []): array
    {
        return array_merge([
            'id' => $company->id,
            'name' => $company->name,
            'admin_email' => 'company@example.test',
            'password' => '',
            'active' => true,
            'is_ss_reference' => $company->is_ss_reference,
            'plant_import_multiplier' => 600,
            'plant_export_multiplier' => 600,
            'sub_import_multiplier' => 5000,
            'sub_export_multiplier' => 5000,
        ], $overrides);
    }
}
