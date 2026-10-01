<?php

namespace Tests\Feature;

use App\Models\Inverter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CreatesSolarData;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use CreatesSolarData, RefreshDatabase;

    public function test_weekly_report_is_monday_to_sunday_and_contains_company_and_inverter_totals(): void
    {
        $company = $this->solarCompany();
        $inverter = Inverter::create(['company_id' => $company->id, 'name' => 'Inverter 1']);
        $admin = $this->superAdmin();
        $this->actingAs($admin)->postJson('/api/readings', $this->readingPayload($company, $inverter, '2026-09-14', [100, 200, 300, 400]));
        $this->actingAs($admin)->postJson('/api/readings', $this->readingPayload($company, $inverter, '2026-09-15', [101, 201, 301, 401]));

        $this->actingAs($admin)->getJson("/api/report?company_id={$company->id}&period=weekly&date_from=2026-09-14&date_to=2026-09-20")
            ->assertOk()
            ->assertJsonPath('rows.0.period', '2026-09-14')
            ->assertJsonPath('rows.0.generation', 251)
            ->assertJsonPath('company_totals.0.company', 'Test Solar')
            ->assertJsonPath('inverter_totals.0.inverter', 'Inverter 1')
            ->assertJsonPath('inverter_totals.0.generation', 251);
    }

    public function test_reports_export_to_excel_and_pdf(): void
    {
        $company = $this->solarCompany();
        $admin = $this->superAdmin();

        $this->actingAs($admin)->get("/api/report/export/excel?company_id={$company->id}&period=monthly&date_from=2026-09-01&date_to=2026-09-30")
            ->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->actingAs($admin)->get("/api/report/export/pdf?company_id={$company->id}&period=monthly&date_from=2026-09-01&date_to=2026-09-30")
            ->assertOk()->assertHeader('content-type', 'application/pdf');
    }
}
