<?php

namespace Tests\Feature;

use App\Models\DailyReading;
use App\Models\Inverter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CreatesSolarData;
use Tests\TestCase;

class ReadingCalculationTest extends TestCase
{
    use CreatesSolarData, RefreshDatabase;

    public function test_units_use_each_company_multiplier(): void
    {
        $company = $this->solarCompany();
        $inverter = Inverter::create(['company_id' => $company->id, 'name' => 'Inverter 1']);
        $admin = $this->superAdmin();

        $this->actingAs($admin)->postJson('/api/readings', $this->readingPayload($company, $inverter, '2026-09-14', [100, 200, 300, 400]))->assertSuccessful();
        $this->actingAs($admin)->postJson('/api/readings', $this->readingPayload($company, $inverter, '2026-09-15', [102, 203, 304, 405]))->assertSuccessful();

        $row = DailyReading::whereDate('reading_date', '2026-09-15')->firstOrFail();
        $this->assertEquals(20, $row->plant_import_unit);
        $this->assertEquals(60, $row->plant_export_unit);
        $this->assertEquals(120, $row->sub_import_unit);
        $this->assertEquals(200, $row->sub_export_unit);
    }

    public function test_editing_old_reading_recalculates_every_later_unit(): void
    {
        $company = $this->solarCompany();
        $inverter = Inverter::create(['company_id' => $company->id, 'name' => 'Inverter 1']);
        $admin = $this->superAdmin();

        $this->actingAs($admin)->postJson('/api/readings', $this->readingPayload($company, $inverter, '2026-09-14', [100, 200, 300, 400]));
        $this->actingAs($admin)->postJson('/api/readings', $this->readingPayload($company, $inverter, '2026-09-15', [105, 205, 305, 405]));
        $this->actingAs($admin)->postJson('/api/readings', $this->readingPayload($company, $inverter, '2026-09-14', [102, 202, 302, 402]))->assertSuccessful();

        $row = DailyReading::whereDate('reading_date', '2026-09-15')->firstOrFail();
        $this->assertEquals(30, $row->plant_import_unit);
        $this->assertEquals(60, $row->plant_export_unit);
        $this->assertEquals(90, $row->sub_import_unit);
        $this->assertEquals(120, $row->sub_export_unit);
    }

    public function test_daily_values_are_limited_to_two_decimal_places(): void
    {
        $company = $this->solarCompany();
        $inverter = Inverter::create(['company_id' => $company->id, 'name' => 'Inverter 1']);
        $admin = $this->superAdmin();
        $payload = $this->readingPayload($company, $inverter, '2026-09-18', [100.123, 200, 300, 400], 12.345);

        $this->actingAs($admin)->postJson('/api/readings', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['plant_import_reading', 'outputs.0.generation']);
    }
}
