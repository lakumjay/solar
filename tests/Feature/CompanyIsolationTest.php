<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\DailyInverterOutput;
use App\Models\DailyReading;
use App\Models\Inverter;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CompanyIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_company_login_only_sees_its_own_company_and_totals(): void
    {
        [$ownCompany, $ownInverter] = $this->companyWithReading('Own Solar', 15);
        [$otherCompany] = $this->companyWithReading('Other Solar', 40);
        $user = User::factory()->create(['company_id' => $ownCompany->id, 'role' => 'company_admin']);

        $this->actingAs($user)->getJson('/api/companies')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $ownCompany->id);

        $this->actingAs($user)->getJson("/api/dashboard?company_id={$otherCompany->id}")
            ->assertOk()
            ->assertJsonPath('is_combined', false)
            ->assertJsonPath('month.generation', 15)
            ->assertJsonPath('rows.0.company_id', $ownCompany->id);

        $this->actingAs($user)->getJson('/api/report?company_id=all&period=monthly&date_from=2026-09-01&date_to=2026-09-30')
            ->assertOk()
            ->assertJsonPath('is_combined', false)
            ->assertJsonPath('grand_total.generation', 15)
            ->assertJsonPath('company_totals.0.company_id', $ownCompany->id)
            ->assertJsonPath('inverter_totals.0.inverter_id', $ownInverter->id)
            ->assertJsonCount(1, 'company_totals');
    }

    public function test_only_super_admin_gets_combined_company_totals(): void
    {
        $this->companyWithReading('First Solar', 15);
        $this->companyWithReading('Second Solar', 40);
        $admin = User::factory()->create(['role' => 'super_admin']);

        $this->actingAs($admin)->getJson('/api/report?company_id=all&period=monthly&date_from=2026-09-01&date_to=2026-09-30')
            ->assertOk()
            ->assertJsonPath('is_combined', true)
            ->assertJsonPath('grand_total.generation', 55)
            ->assertJsonCount(2, 'company_totals');
    }

    public function test_inactive_company_user_cannot_login(): void
    {
        $company = Company::create(['name' => 'Inactive Solar', 'active' => false]);
        $user = User::factory()->create([
            'company_id' => $company->id,
            'email' => 'inactive@example.com',
            'password' => Hash::make('password'),
            'role' => 'company_admin',
        ]);

        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Invalid email or password.');
    }

    private function companyWithReading(string $name, float $generation): array
    {
        $company = Company::create(['name' => $name]);
        $inverter = Inverter::create(['company_id' => $company->id, 'name' => 'Inverter 1']);
        $reading = DailyReading::create([
            'company_id' => $company->id,
            'reading_date' => '2026-09-18',
            'plant_import_unit' => 1,
            'plant_export_unit' => 2,
            'sub_import_unit' => 3,
            'sub_export_unit' => 4,
        ]);
        DailyInverterOutput::create(['daily_reading_id' => $reading->id, 'inverter_id' => $inverter->id, 'generation' => $generation]);

        return [$company, $inverter];
    }
}
