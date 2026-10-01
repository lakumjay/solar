<?php

namespace Tests\Feature;

use App\Models\DailyReading;
use App\Models\Inverter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\Support\CreatesSolarData;
use Tests\TestCase;

class ExcelImportTest extends TestCase
{
    use CreatesSolarData, RefreshDatabase;

    public function test_legacy_excel_import_reads_raw_values_and_recalculates_units(): void
    {
        $company = $this->solarCompany();
        $inverter = Inverter::create(['company_id' => $company->id, 'name' => 'Inverter 1']);
        $admin = $this->superAdmin();
        $book = new Spreadsheet;
        $sheet = $book->getActiveSheet();
        $sheet->setTitle($company->name);
        $sheet->fromArray(['Date', 'Inverter 1', 'Plant Import Reding', 'Plant Export Reding', '66kV Sub Import Reading', '66kV Sub Export Reading'], null, 'A3');
        $sheet->fromArray([ExcelDate::PHPToExcel(new \DateTimeImmutable('2026-09-14')), 100, 10, 20, 30, 40], null, 'A5');
        $sheet->fromArray([ExcelDate::PHPToExcel(new \DateTimeImmutable('2026-09-15')), 125.678, 12, 23, 34, 45], null, 'A6');
        $sheet->getStyle('A5:A6')->getNumberFormat()->setFormatCode('dd/mm/yyyy');
        $path = sys_get_temp_dir().'/solarflow-import-'.bin2hex(random_bytes(6)).'.xlsx';
        (new Xlsx($book))->save($path);
        $upload = new UploadedFile($path, 'readings.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);

        $this->actingAs($admin)->post('/api/import/excel', ['file' => $upload], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('imported', 2);

        $row = DailyReading::where('company_id', $company->id)->latest('reading_date')->firstOrFail();
        $this->assertEquals(20, $row->plant_import_unit);
        $this->assertEquals(60, $row->plant_export_unit);
        $this->assertEquals(120, $row->sub_import_unit);
        $this->assertEquals(200, $row->sub_export_unit);
        $this->assertEquals(125.68, $row->outputs()->where('inverter_id', $inverter->id)->value('generation'));
        @unlink($path);
    }
}
