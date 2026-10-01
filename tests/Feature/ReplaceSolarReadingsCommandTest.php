<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Company;
use App\Models\DailyInverterOutput;
use App\Models\DailyReading;
use App\Models\Inverter;
use App\Models\User;
use App\Services\ReadingCalculationService;
use DateTimeImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use RuntimeException;
use Tests\TestCase;

class ReplaceSolarReadingsCommandTest extends TestCase
{
    use RefreshDatabase;

    private array $temporaryFiles = [];

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $file) {
            @unlink($file);
        }

        parent::tearDown();
    }

    public function test_dry_run_validates_without_changing_or_backing_up_data(): void
    {
        Storage::fake('local');
        [$admin, $companies] = $this->configuredCompanies();
        $this->seedDummyReading($companies[0], $admin, '2026-09-20');
        $workbook = $this->workbookPath();

        $this->artisan('solar:replace-readings', ['file' => $workbook])
            ->expectsOutputToContain('Workbook validation passed.')
            ->expectsOutputToContain('DRY RUN: 1 existing readings and 1 inverter outputs')
            ->expectsOutputToContain('No database records were changed.')
            ->assertSuccessful();

        $this->assertTrue(DailyReading::where('company_id', $companies[0]->id)->whereDate('reading_date', '2026-09-20')->exists());
        Storage::disk('local')->assertDirectoryEmpty('/');
    }

    public function test_commit_backs_up_and_replaces_only_solar_readings(): void
    {
        Storage::fake('local');
        [$admin, $companies] = $this->configuredCompanies();
        $otherUser = User::factory()->create(['role' => 'employee', 'active' => true]);
        $oldLog = ActivityLog::create([
            'user_id' => $admin->id,
            'action' => 'created',
            'subject_type' => 'daily_reading',
            'subject_id' => 999,
            'description' => 'Historical log must remain.',
        ]);
        foreach ($companies as $company) {
            $this->seedDummyReading($company, $admin, '2026-09-20');
        }
        $this->seedDummyReading($companies[0], $admin, '2026-07-31');
        $workbook = $this->workbookPath();

        $this->artisan('solar:replace-readings', ['file' => $workbook, '--commit' => true])
            ->expectsOutputToContain('Replacement complete: 141 readings and 464 inverter outputs imported.')
            ->assertSuccessful();

        $this->assertSame(141, DailyReading::count());
        $this->assertSame(464, DailyInverterOutput::count());
        $this->assertSame(47, DailyReading::where('company_id', $companies[0]->id)->count());
        $this->assertSame(47, DailyReading::where('company_id', $companies[1]->id)->count());
        $this->assertSame(47, DailyReading::where('company_id', $companies[2]->id)->count());
        $this->assertFalse(DailyReading::whereIn('reading_date', ['2026-07-31', '2026-09-20'])->exists());
        $this->assertDatabaseHas('users', ['id' => $otherUser->id]);
        $this->assertDatabaseHas('activity_logs', ['id' => $oldLog->id, 'description' => 'Historical log must remain.']);

        $first = DailyReading::where('company_id', $companies[0]->id)->whereDate('reading_date', '2026-08-01')->firstOrFail();
        $second = DailyReading::where('company_id', $companies[0]->id)->whereDate('reading_date', '2026-08-02')->firstOrFail();
        $this->assertNull($first->plant_import_unit);
        $this->assertEquals(10, $second->plant_import_unit);
        $this->assertSame($admin->id, $first->created_by);

        $nilkanthFirst = DailyReading::where('company_id', $companies[2]->id)->whereDate('reading_date', '2026-08-01')->firstOrFail();
        $nilkanthFourthInverter = $companies[2]->inverters()->orderBy('id')->get()[3];
        $this->assertDatabaseMissing('daily_inverter_outputs', [
            'daily_reading_id' => $nilkanthFirst->id,
            'inverter_id' => $nilkanthFourthInverter->id,
        ]);

        $replacementLog = ActivityLog::where('subject_type', 'solar_readings_import')->sole();
        $this->assertSame(141, $replacementLog->changes['reading_count']);
        $this->assertSame(464, $replacementLog->changes['inverter_output_count']);
        $this->assertNotEmpty($replacementLog->changes['workbook_sha256']);
        Storage::disk('local')->assertExists($replacementLog->changes['backup_path']);

        $backup = json_decode(Storage::disk('local')->get($replacementLog->changes['backup_path']), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame(4, $backup['daily_readings_count']);
        $this->assertSame(4, $backup['daily_inverter_outputs_count']);
    }

    public function test_failure_during_commit_rolls_back_the_replacement(): void
    {
        Storage::fake('local');
        [$admin, $companies] = $this->configuredCompanies();
        $old = $this->seedDummyReading($companies[0], $admin, '2026-09-20');
        $workbook = $this->workbookPath();

        $this->mock(ReadingCalculationService::class, function ($mock): void {
            $mock->shouldReceive('recalculate')->once()->andThrow(new RuntimeException('Forced calculation failure'));
        });

        $this->artisan('solar:replace-readings', ['file' => $workbook, '--commit' => true])
            ->expectsOutputToContain('The replacement transaction was rolled back.')
            ->assertFailed();

        $this->assertTrue(DailyReading::whereKey($old->id)->whereDate('reading_date', '2026-09-20')->exists());
        $this->assertSame(1, DailyReading::count());
        $this->assertSame(1, DailyInverterOutput::count());
        $this->assertSame(0, ActivityLog::where('subject_type', 'solar_readings_import')->count());
        $this->assertCount(1, Storage::disk('local')->allFiles('import-backups'));
    }

    public function test_malformed_workbook_is_rejected_before_backup_or_deletion(): void
    {
        Storage::fake('local');
        [$admin, $companies] = $this->configuredCompanies();
        $old = $this->seedDummyReading($companies[0], $admin, '2026-09-20');
        $workbook = $this->workbookPath(true);

        $this->artisan('solar:replace-readings', ['file' => $workbook, '--commit' => true])
            ->expectsOutputToContain('Required meter value is not numeric')
            ->assertFailed();

        $this->assertDatabaseHas('daily_readings', ['id' => $old->id]);
        Storage::disk('local')->assertDirectoryEmpty('/');
    }

    public function test_command_refuses_to_run_in_production(): void
    {
        Storage::fake('local');
        $this->configuredCompanies();
        $this->app->instance('env', 'production');

        $this->artisan('solar:replace-readings', ['file' => '/does/not/matter.xlsx', '--commit' => true])
            ->expectsOutputToContain('disabled in production')
            ->assertFailed();

        Storage::disk('local')->assertDirectoryEmpty('/');
    }

    private function configuredCompanies(): array
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'active' => true]);
        $definitions = [
            ['Sunrise Green Energy', 2],
            ['Rajeshwari Solar', 4],
            ['Nilkanth Green Energy', 4],
        ];
        $companies = [];

        foreach ($definitions as $companyIndex => [$name, $inverterCount]) {
            $company = Company::create([
                'name' => $name,
                'active' => true,
                'is_ss_reference' => $companyIndex === 0,
                'plant_import_multiplier' => 10,
                'plant_export_multiplier' => 20,
                'sub_import_multiplier' => 30,
                'sub_export_multiplier' => 40,
            ]);
            for ($number = 1; $number <= $inverterCount; $number++) {
                Inverter::create([
                    'company_id' => $company->id,
                    'name' => "Inverter {$number}",
                    'active' => true,
                ]);
            }
            $companies[] = $company;
        }

        return [$admin, $companies];
    }

    private function seedDummyReading(Company $company, User $admin, string $date): DailyReading
    {
        $reading = DailyReading::create([
            'company_id' => $company->id,
            'reading_date' => $date,
            'plant_import_reading' => 1,
            'plant_export_reading' => 2,
            'sub_import_reading' => 3,
            'sub_export_reading' => 4,
            'created_by' => $admin->id,
            'updated_by' => $admin->id,
        ]);
        DailyInverterOutput::create([
            'daily_reading_id' => $reading->id,
            'inverter_id' => $company->inverters()->orderBy('id')->value('id'),
            'generation' => 5,
        ]);

        return $reading;
    }

    private function workbookPath(bool $malformed = false): string
    {
        $spreadsheet = new Spreadsheet;
        $definitions = [
            ['Sunrise Green Energy', 2],
            ['Rajeshwari Solar', 4],
            ['Nilkanth Green Energy', 4],
        ];

        foreach ($definitions as $companyIndex => [$companyName, $inverterCount]) {
            $sheet = $companyIndex === 0 ? $spreadsheet->getActiveSheet() : $spreadsheet->createSheet();
            $sheet->setTitle($companyName);
            $headers = ['Date'];
            for ($inverter = 1; $inverter <= $inverterCount; $inverter++) {
                $headers[] = "Inverter {$inverter}";
            }
            $headers = [...$headers, 'Plant Import Reding', 'Plant Export Reding', '66kV Sub Import Reading', '66kV Sub Export Reading'];
            $sheet->fromArray($headers, null, 'A3');

            $date = new DateTimeImmutable('2026-08-01');
            $end = new DateTimeImmutable('2026-09-16');
            $row = 5;
            $sequence = 0;
            while ($date <= $end) {
                if ((int) $date->format('d') <= 12) {
                    $storedDate = new DateTimeImmutable($date->format('Y-d-m'));
                    $sheet->setCellValue([1, $row], ExcelDate::PHPToExcel($storedDate));
                    $sheet->getStyle([1, $row])->getNumberFormat()->setFormatCode('mm/dd/yyyy');
                } else {
                    $sheet->setCellValue([1, $row], $date->format('d/m/Y'));
                }

                for ($inverter = 1; $inverter <= $inverterCount; $inverter++) {
                    $value = $companyName === 'Nilkanth Green Energy' && $inverter === 4 && $sequence < 6
                        ? '-'
                        : ($companyIndex + 1) * 100 + $sequence + ($inverter / 10);
                    $sheet->setCellValue([$inverter + 1, $row], $value);
                }

                $meterStart = 2 + $inverterCount;
                $base = ($companyIndex + 1) * 1000 + $sequence;
                $sheet->setCellValue([$meterStart, $row], $malformed && $companyIndex === 0 && $sequence === 0 ? '-' : $base);
                $sheet->setCellValue([$meterStart + 1, $row], $base * 2);
                $sheet->setCellValue([$meterStart + 2, $row], $base * 3);
                $sheet->setCellValue([$meterStart + 3, $row], $base * 4);

                $date = $date->modify('+1 day');
                $row++;
                $sequence++;
            }
        }

        $path = sys_get_temp_dir().'/replace-solar-readings-'.bin2hex(random_bytes(8)).'.xlsx';
        (new Xlsx($spreadsheet))->save($path);
        $spreadsheet->disconnectWorksheets();
        $this->temporaryFiles[] = $path;

        return $path;
    }
}
