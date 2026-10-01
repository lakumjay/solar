<?php

namespace Tests\Feature;

use App\Models\DailyReading;
use App\Models\Inverter;
use App\Models\User;
use App\Services\CompanyWiseReportExporter;
use App\Services\CompanyWiseReportService;
use App\Services\DailySsReportExporter;
use App\Services\ExcelReportExporter;
use App\Services\ReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PhpOffice\PhpSpreadsheet\IOFactory;
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

    public function test_combined_reports_use_only_the_reference_company_for_66kv_sub_import(): void
    {
        $firstCompany = $this->solarCompany(['name' => 'Sunrise Green Energy']);
        $secondCompany = $this->solarCompany(['name' => 'Second Solar']);
        DailyReading::create(['company_id' => $firstCompany->id, 'reading_date' => '2026-09-06', 'plant_import_unit' => 10, 'plant_export_unit' => 20, 'sub_import_unit' => 100, 'sub_export_unit' => 30]);
        DailyReading::create(['company_id' => $secondCompany->id, 'reading_date' => '2026-09-06', 'plant_import_unit' => 1, 'plant_export_unit' => 2, 'sub_import_unit' => 100, 'sub_export_unit' => 3]);
        DailyReading::create(['company_id' => $secondCompany->id, 'reading_date' => '2026-09-07', 'plant_import_unit' => 4, 'plant_export_unit' => 5, 'sub_import_unit' => 100, 'sub_export_unit' => 6]);
        DailyReading::create(['company_id' => $firstCompany->id, 'reading_date' => '2026-09-08', 'plant_import_unit' => 40, 'plant_export_unit' => 50, 'sub_import_unit' => 200, 'sub_export_unit' => 60]);
        DailyReading::create(['company_id' => $secondCompany->id, 'reading_date' => '2026-09-08', 'plant_import_unit' => 7, 'plant_export_unit' => 8, 'sub_import_unit' => 100, 'sub_export_unit' => 9]);

        $service = app(ReportService::class);
        $daily = $service->build(null, 'daily', now()->setDate(2026, 9, 6), now()->setDate(2026, 9, 8));
        $weekly = $service->build(null, 'weekly', now()->setDate(2026, 9, 6), now()->setDate(2026, 9, 8));
        $monthly = $service->build(null, 'monthly', now()->setDate(2026, 9, 6), now()->setDate(2026, 9, 8));
        $singleCompany = $service->build($secondCompany->id, 'monthly', now()->setDate(2026, 9, 6), now()->setDate(2026, 9, 8));

        $this->assertSame([100.0, 0.0, 200.0], array_column($daily['rows'], 'sub_import'));
        $this->assertSame([100.0, 200.0], array_column($weekly['rows'], 'sub_import'));
        $this->assertSame(300.0, $weekly['grand_total']['sub_import']);
        $this->assertSame(300.0, $monthly['rows'][0]['sub_import']);
        $this->assertSame(300.0, $monthly['grand_total']['sub_import']);
        $this->assertSame(62.0, $monthly['grand_total']['plant_import']);
        $this->assertSame(85.0, $monthly['grand_total']['plant_export']);
        $this->assertSame(108.0, $monthly['grand_total']['sub_export']);
        $this->assertSame(300.0, $monthly['company_totals'][0]['sub_import']);
        $this->assertSame(300.0, $monthly['company_totals'][1]['sub_import']);
        $this->assertSame(300.0, $singleCompany['grand_total']['sub_import']);
        $this->assertSame(['2026-09-07'], $singleCompany['ss_reference']['missing_dates']);
        $this->assertSame('Sunrise Green Energy', $monthly['ss_reference']['company']);
        $this->assertSame(['2026-09-07'], $monthly['ss_reference']['missing_dates']);

        $path = app(ExcelReportExporter::class)->create($monthly);
        $sheet = IOFactory::load($path)->getActiveSheet();
        $this->assertSame('Daily SS reference company', $sheet->getCell('D2')->getValue());
        $this->assertSame('Sunrise Green Energy', $sheet->getCell('E2')->getValue());
        $this->assertSame('2026-09-07', $sheet->getCell('B3')->getValue());
        $this->assertSame(300.0, $sheet->getCell('E5')->getValue());
        unlink($path);

        $pdfHtml = view('reports.solar', ['report' => $monthly])->render();
        $this->assertStringContainsString('Daily SS reference company:', $pdfHtml);
        $this->assertStringContainsString('2026-09-07', $pdfHtml);
    }

    public function test_daily_ss_export_is_global_reference_based_and_warns_about_missing_dates(): void
    {
        $firstCompany = $this->solarCompany(['name' => 'Sunrise Green Energy']);
        $secondCompany = $this->solarCompany(['name' => 'Second Solar']);
        $admin = $this->superAdmin();
        $companyAdmin = User::factory()->create(['company_id' => $secondCompany->id, 'role' => 'company_admin']);
        DailyReading::create(['company_id' => $firstCompany->id, 'reading_date' => '2026-09-06', 'sub_import_unit' => 20050]);
        DailyReading::create(['company_id' => $secondCompany->id, 'reading_date' => '2026-09-06', 'sub_import_unit' => 450]);
        DailyReading::create(['company_id' => $secondCompany->id, 'reading_date' => '2026-09-07', 'sub_import_unit' => 900]);
        DailyReading::create(['company_id' => $firstCompany->id, 'reading_date' => '2026-09-08', 'sub_import_unit' => 17200]);

        $report = app(ReportService::class)->dailySs(now()->setDate(2026, 9, 6), now()->setDate(2026, 9, 8));
        $this->assertSame([
            ['date' => '2026-09-06', 'daily_ss_reading' => 20050.0],
            ['date' => '2026-09-07', 'daily_ss_reading' => 0.0],
            ['date' => '2026-09-08', 'daily_ss_reading' => 17200.0],
        ], $report['rows']);
        $this->assertSame('Sunrise Green Energy', $report['ss_reference']['company']);
        $this->assertSame(['2026-09-07'], $report['ss_reference']['missing_dates']);

        $path = app(DailySsReportExporter::class)->create($report);
        $book = IOFactory::load($path);
        $sheet = $book->getActiveSheet();
        $this->assertSame('Daily SS Report', $sheet->getTitle());
        $this->assertSame('Date', $sheet->getCell('A1')->getValue());
        $this->assertSame('Daily SS Reading', $sheet->getCell('B1')->getValue());
        $this->assertSame(20050.0, $sheet->getCell('B2')->getValue());
        $this->assertSame(0.0, $sheet->getCell('B3')->getValue());
        $this->assertSame('Kashtabhajan Green Energy', $sheet->getCell('C1')->getValue());
        $this->assertSame('Sunrise Green Energy', $book->getSheetByName('Report Info')->getCell('B3')->getValue());
        $this->assertSame('2026-09-07', $book->getSheetByName('Report Info')->getCell('B4')->getValue());
        unlink($path);

        $this->actingAs($admin)->get('/api/report/export/daily-ss-excel?date_from=2026-09-06&date_to=2026-09-08')
            ->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->actingAs($companyAdmin)->get('/api/report/export/daily-ss-excel?date_from=2026-09-06&date_to=2026-09-08')
            ->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    public function test_company_wise_export_only_contains_selected_columns(): void
    {
        $company = $this->solarCompany(['name' => 'Sunrise Green Energy']);
        $first = Inverter::create(['company_id' => $company->id, 'name' => 'Inverter 1']);
        $second = Inverter::create(['company_id' => $company->id, 'name' => 'Inverter 2']);
        $admin = $this->superAdmin();
        $firstPayload = $this->readingPayload($company, $first, '2026-08-01', [3, 167.19, 135.94, 1.32], 325.4);
        $firstPayload['outputs'][] = ['inverter_id' => $second->id, 'generation' => 339.8];
        $secondPayload = $this->readingPayload($company, $first, '2026-08-02', [3.02, 169.31, 137.79, 1.34], 637.4);
        $secondPayload['outputs'][] = ['inverter_id' => $second->id, 'generation' => 664.9];
        $this->actingAs($admin)->postJson('/api/readings', $firstPayload)->assertOk();
        $this->actingAs($admin)->postJson('/api/readings', $secondPayload)->assertOk();

        $report = app(CompanyWiseReportService::class)->build(
            $company->id,
            now()->setDate(2026, 8, 1),
            now()->setDate(2026, 8, 2),
            [$first->id],
            ['plant_import_reading', 'sub_import_unit'],
        );
        $path = app(CompanyWiseReportExporter::class)->create($report);
        $sheet = IOFactory::load($path)->getActiveSheet();

        $this->assertSame('Date', $sheet->getCell('A3')->getValue());
        $this->assertSame('Inverter 1', $sheet->getCell('B3')->getValue());
        $this->assertSame('Plant Import Reading', $sheet->getCell('C3')->getValue());
        $this->assertSame('66kV Sub Import Unit', $sheet->getCell('D3')->getValue());
        $this->assertSame('Sunrise Green Energy', $sheet->getCell('B2')->getValue());
        $this->assertSame('66kV SUBSTATION / GETCO END METER', $sheet->getCell('D1')->getValue());
        $this->assertNotContains('Plant Import Unit', $sheet->rangeToArray('A3:D3')[0]);
        $this->assertSame('FFF200', $sheet->getStyle('A3')->getFill()->getStartColor()->getRGB());
        $this->assertSame($sheet->getStyle('A3')->getFill()->getStartColor()->getRGB(), $sheet->getStyle('D3')->getFill()->getStartColor()->getRGB());
        $this->assertSame('B5', $sheet->getFreezePane());
        $this->assertSame(637.4, $sheet->getCell('B6')->getValue());
        $this->assertSame(55.5, $sheet->getCell('D6')->getValue());
        unlink($path);

        $this->actingAs($admin)->get('/api/report/export/company-excel?company_id='.$company->id.'&date_from=2026-08-01&date_to=2026-08-02&inverter_ids[]='.$first->id.'&columns[]=plant_import_reading&columns[]=sub_import_unit')
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
}
