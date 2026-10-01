<?php

namespace App\Services;

use App\Models\Company;
use App\Models\DailyInverterOutput;
use App\Models\DailyReading;
use App\Models\User;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use RuntimeException;
use Throwable;

class ReplaceSolarReadingsService
{
    private const EXPECTED_COMPANIES = [
        'Sunrise Green Energy' => 2,
        'Rajeshwari Solar' => 4,
        'Nilkanth Green Energy' => 4,
    ];

    private const EXPECTED_START = '2026-08-01';

    private const EXPECTED_END = '2026-09-16';

    private const EXPECTED_READING_COUNT = 141;

    private const EXPECTED_OUTPUT_COUNT = 464;

    private const METER_HEADERS = [
        'plant_import_reading' => ['plantimportreading', 'plantimportreding'],
        'plant_export_reading' => ['plantexportreading', 'plantexportreding'],
        'sub_import_reading' => ['66kvsubimportreading', 'subimportreading'],
        'sub_export_reading' => ['66kvsubexportreading', 'subexportreading'],
    ];

    public function __construct(
        private readonly ReadingCalculationService $calculator,
        private readonly ActivityLogger $activityLogger,
    ) {}

    /**
     * Validate the workbook and return a mutation-free summary.
     */
    public function preview(string $path): array
    {
        return $this->summary($this->validatedWorkbook($path));
    }

    /**
     * Replace the three companies' readings after a complete validation pass.
     */
    public function replace(string $path, User $actor): array
    {
        if (app()->environment('production')) {
            throw new RuntimeException('Solar reading replacement is disabled in production.');
        }

        if ($actor->role !== 'super_admin' || ! $actor->active) {
            throw new RuntimeException('An active super-admin account is required for this import.');
        }

        $validated = $this->validatedWorkbook($path);
        $backupPath = $this->writeBackup($validated);

        try {
            DB::transaction(function () use ($validated, $actor, $backupPath): void {
                $companyIds = collect($validated['companies'])->pluck('company_id')->all();

                DailyReading::whereIn('company_id', $companyIds)->delete();

                foreach ($validated['companies'] as $companyData) {
                    foreach ($companyData['rows'] as $row) {
                        $reading = DailyReading::create([
                            'company_id' => $companyData['company_id'],
                            'reading_date' => $row['date'],
                            'plant_import_reading' => $row['plant_import_reading'],
                            'plant_export_reading' => $row['plant_export_reading'],
                            'sub_import_reading' => $row['sub_import_reading'],
                            'sub_export_reading' => $row['sub_export_reading'],
                            'created_by' => $actor->id,
                            'updated_by' => $actor->id,
                        ]);

                        foreach ($row['inverters'] as $inverterId => $generation) {
                            if ($generation === null) {
                                continue;
                            }

                            DailyInverterOutput::create([
                                'daily_reading_id' => $reading->id,
                                'inverter_id' => $inverterId,
                                'generation' => $generation,
                            ]);
                        }
                    }

                    $this->calculator->recalculate($companyData['company_id']);
                }

                $this->verifyStoredData($validated);

                $summary = $this->summary($validated);
                $this->activityLogger->log(
                    $actor,
                    null,
                    'replaced',
                    'solar_readings_import',
                    null,
                    'Replaced local solar readings with the validated authoritative workbook.',
                    [
                        'workbook_sha256' => $summary['workbook_sha256'],
                        'workbook_name' => $summary['workbook_name'],
                        'backup_path' => $backupPath,
                        'reading_count' => $summary['reading_count'],
                        'inverter_output_count' => $summary['inverter_output_count'],
                        'date_range' => [$summary['date_start'], $summary['date_end']],
                        'companies' => $summary['companies'],
                    ],
                );
            }, 3);
        } catch (Throwable $exception) {
            throw new RuntimeException(
                "The replacement transaction was rolled back. Backup retained at {$backupPath}. {$exception->getMessage()}",
                previous: $exception,
            );
        }

        return [...$this->summary($validated), 'backup_path' => $backupPath];
    }

    private function validatedWorkbook(string $path): array
    {
        $resolvedPath = realpath($path);
        if ($resolvedPath === false || ! is_file($resolvedPath) || ! is_readable($resolvedPath)) {
            throw new InvalidArgumentException("Workbook is not readable: {$path}");
        }

        if (! in_array(strtolower(pathinfo($resolvedPath, PATHINFO_EXTENSION)), ['xlsx', 'xls'], true)) {
            throw new InvalidArgumentException('The source must be an XLSX or XLS workbook.');
        }

        $companies = Company::query()
            ->with(['inverters' => fn ($query) => $query->orderBy('id')])
            ->whereIn('name', array_keys(self::EXPECTED_COMPANIES))
            ->get()
            ->keyBy(fn (Company $company) => $this->normalize($company->name));

        if ($companies->count() !== count(self::EXPECTED_COMPANIES)) {
            throw new RuntimeException('The database must contain exactly the three expected company configurations.');
        }

        foreach (self::EXPECTED_COMPANIES as $companyName => $inverterCount) {
            /** @var Company|null $company */
            $company = $companies->get($this->normalize($companyName));
            if (! $company || ! $company->active) {
                throw new RuntimeException("Company must exist and be active: {$companyName}");
            }

            if ($company->inverters->count() !== $inverterCount || $company->inverters->contains(fn ($inverter) => ! $inverter->active)) {
                throw new RuntimeException("{$companyName} must have exactly {$inverterCount} active configured inverters.");
            }

            foreach ($company->inverters->values() as $index => $inverter) {
                if ($this->normalizeHeader($inverter->name) !== 'inverter'.($index + 1)) {
                    throw new RuntimeException("Unexpected inverter configuration for {$companyName}: {$inverter->name}");
                }
            }
        }

        $reader = IOFactory::createReaderForFile($resolvedPath);
        $reader->setReadDataOnly(false);
        $spreadsheet = $reader->load($resolvedPath);

        try {
            $sheets = $spreadsheet->getAllSheets();
            $expectedSheetNames = collect(array_keys(self::EXPECTED_COMPANIES))
                ->map(fn (string $name) => $this->normalize($name))
                ->sort()
                ->values()
                ->all();
            $actualSheetNames = collect($sheets)
                ->map(fn ($sheet) => $this->normalize($sheet->getTitle()))
                ->sort()
                ->values()
                ->all();

            if (count($sheets) !== 3 || $actualSheetNames !== $expectedSheetNames) {
                throw new RuntimeException('Workbook sheets must be exactly Sunrise Green Energy, Rajeshwari Solar, and Nilkanth Green Energy.');
            }

            $parsedCompanies = [];
            $canonicalDates = null;
            $seenCompanyDates = [];
            $seenReadingInverters = [];

            foreach ($sheets as $sheet) {
                $normalizedTitle = $this->normalize($sheet->getTitle());
                /** @var Company $company */
                $company = $companies->get($normalizedTitle);
                $expectedInverterCount = self::EXPECTED_COMPANIES[$company->name];
                $columns = $this->mapColumns($sheet, $expectedInverterCount);
                $inverters = $company->inverters->values();
                $rows = [];

                for ($rowNumber = 5; $rowNumber <= $sheet->getHighestDataRow(); $rowNumber++) {
                    $dateCell = $sheet->getCell([$columns['date'], $rowNumber]);
                    $displayedDate = trim((string) $dateCell->getFormattedValue());
                    if ($displayedDate === '') {
                        continue;
                    }

                    $date = $this->parseDisplayedDate($displayedDate, $sheet->getTitle(), $rowNumber);
                    $companyDateKey = $company->id.'|'.$date;
                    if (isset($seenCompanyDates[$companyDateKey])) {
                        throw new RuntimeException("Duplicate company/date in {$sheet->getTitle()} row {$rowNumber}: {$date}");
                    }
                    $seenCompanyDates[$companyDateKey] = true;

                    $parsedRow = ['date' => $date, 'inverters' => []];
                    foreach (self::METER_HEADERS as $field => $_aliases) {
                        $parsedRow[$field] = $this->requiredNumber(
                            $sheet->getCell([$columns[$field], $rowNumber])->getValue(),
                            "{$sheet->getTitle()} row {$rowNumber} {$field}",
                        );
                    }

                    foreach ($columns['inverters'] as $position => $column) {
                        $inverter = $inverters[$position - 1];
                        $readingInverterKey = $companyDateKey.'|'.$inverter->id;
                        if (isset($seenReadingInverters[$readingInverterKey])) {
                            throw new RuntimeException("Duplicate inverter value in {$sheet->getTitle()} row {$rowNumber}.");
                        }
                        $seenReadingInverters[$readingInverterKey] = true;
                        $parsedRow['inverters'][$inverter->id] = $this->optionalNumber(
                            $sheet->getCell([$column, $rowNumber])->getValue(),
                            "{$sheet->getTitle()} row {$rowNumber} inverter {$position}",
                        );
                    }

                    $rows[] = $parsedRow;
                }

                $dates = array_column($rows, 'date');
                $this->validateDates($dates, $sheet->getTitle());
                if ($canonicalDates !== null && $dates !== $canonicalDates) {
                    throw new RuntimeException("{$sheet->getTitle()} does not contain the same date sequence as the other sheets.");
                }
                $canonicalDates ??= $dates;

                $parsedCompanies[] = [
                    'company_id' => $company->id,
                    'company_name' => $company->name,
                    'sheet_name' => $sheet->getTitle(),
                    'inverter_count' => $expectedInverterCount,
                    'reading_count' => count($rows),
                    'inverter_output_count' => collect($rows)->sum(
                        fn (array $row) => collect($row['inverters'])->filter(fn ($value) => $value !== null)->count()
                    ),
                    'rows' => $rows,
                ];
            }

            $readingCount = collect($parsedCompanies)->sum('reading_count');
            $outputCount = collect($parsedCompanies)->sum('inverter_output_count');
            if ($readingCount !== self::EXPECTED_READING_COUNT || $outputCount !== self::EXPECTED_OUTPUT_COUNT) {
                throw new RuntimeException(
                    "Workbook totals must be 141 readings and 464 populated inverter outputs; found {$readingCount} and {$outputCount}."
                );
            }

            return [
                'path' => $resolvedPath,
                'hash' => hash_file('sha256', $resolvedPath),
                'date_start' => self::EXPECTED_START,
                'date_end' => self::EXPECTED_END,
                'reading_count' => $readingCount,
                'inverter_output_count' => $outputCount,
                'companies' => $parsedCompanies,
            ];
        } finally {
            $spreadsheet->disconnectWorksheets();
        }
    }

    private function mapColumns($sheet, int $expectedInverterCount): array
    {
        $headers = [];
        $highestColumn = Coordinate::columnIndexFromString($sheet->getHighestDataColumn());
        for ($column = 1; $column <= $highestColumn; $column++) {
            $header = $this->normalizeHeader((string) $sheet->getCell([$column, 3])->getValue());
            if ($header === '') {
                continue;
            }
            if (isset($headers[$header])) {
                $requiredHeaders = collect(self::METER_HEADERS)->flatten()->push('date')->all();
                if (in_array($header, $requiredHeaders, true) || preg_match('/^inverter[0-9]+$/', $header)) {
                    throw new RuntimeException("Duplicate required header in {$sheet->getTitle()}: {$header}");
                }

                continue;
            }
            $headers[$header] = $column;
        }

        $mapped = ['inverters' => []];
        $mapped['date'] = $headers['date'] ?? throw new RuntimeException("Missing Date header in {$sheet->getTitle()}.");
        foreach (self::METER_HEADERS as $field => $aliases) {
            foreach ($aliases as $alias) {
                if (isset($headers[$alias])) {
                    $mapped[$field] = $headers[$alias];
                    break;
                }
            }
            if (! isset($mapped[$field])) {
                throw new RuntimeException("Missing required {$field} header in {$sheet->getTitle()}.");
            }
        }

        foreach ($headers as $header => $column) {
            if (preg_match('/^inverter([0-9]+)$/', $header, $matches)) {
                $position = (int) $matches[1];
                if (isset($mapped['inverters'][$position])) {
                    throw new RuntimeException("Duplicate Inverter {$position} header in {$sheet->getTitle()}.");
                }
                $mapped['inverters'][$position] = $column;
            }
        }
        ksort($mapped['inverters']);

        if (array_keys($mapped['inverters']) !== range(1, $expectedInverterCount)) {
            throw new RuntimeException("{$sheet->getTitle()} must contain Inverter 1 through Inverter {$expectedInverterCount}.");
        }

        return $mapped;
    }

    private function validateDates(array $dates, string $sheetName): void
    {
        $expected = [];
        $date = new DateTimeImmutable(self::EXPECTED_START);
        $end = new DateTimeImmutable(self::EXPECTED_END);
        while ($date <= $end) {
            $expected[] = $date->format('Y-m-d');
            $date = $date->modify('+1 day');
        }

        if ($dates !== $expected) {
            throw new RuntimeException("{$sheetName} must contain every date from 01/08/2026 through 16/09/2026 exactly once and in order.");
        }
    }

    private function parseDisplayedDate(string $value, string $sheetName, int $row): string
    {
        $date = DateTimeImmutable::createFromFormat('!d/m/Y', $value);
        $errors = DateTimeImmutable::getLastErrors();
        if (! $date || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) || $date->format('d/m/Y') !== $value) {
            throw new RuntimeException("Invalid displayed date in {$sheetName} row {$row}: {$value}");
        }

        return $date->format('Y-m-d');
    }

    private function requiredNumber(mixed $value, string $label): float
    {
        if (is_string($value)) {
            $value = trim(str_replace(',', '', $value));
        }
        if ($value === '' || $value === null || $value === '-' || ! is_numeric($value)) {
            throw new RuntimeException("Required meter value is not numeric at {$label}.");
        }

        return round((float) $value, 4);
    }

    private function optionalNumber(mixed $value, string $label): ?float
    {
        if (is_string($value)) {
            $value = trim(str_replace(',', '', $value));
        }
        if ($value === '' || $value === null || $value === '-') {
            return null;
        }
        if (! is_numeric($value)) {
            throw new RuntimeException("Inverter value is not numeric at {$label}.");
        }

        return round((float) $value, 2);
    }

    private function writeBackup(array $validated): string
    {
        $companyIds = collect($validated['companies'])->pluck('company_id')->all();
        $readings = DailyReading::query()
            ->with(['outputs' => fn ($query) => $query->orderBy('id')])
            ->whereIn('company_id', $companyIds)
            ->orderBy('company_id')
            ->orderBy('reading_date')
            ->get();

        $backup = [
            'created_at' => now()->toIso8601String(),
            'database' => config('database.connections.'.config('database.default').'.database'),
            'source' => [
                'workbook_name' => basename($validated['path']),
                'sha256' => $validated['hash'],
            ],
            'daily_readings_count' => $readings->count(),
            'daily_inverter_outputs_count' => $readings->sum(fn (DailyReading $reading) => $reading->outputs->count()),
            'daily_readings' => $readings->map(fn (DailyReading $reading) => [
                'attributes' => $reading->getRawOriginal(),
                'daily_inverter_outputs' => $reading->outputs->map(
                    fn (DailyInverterOutput $output) => $output->getRawOriginal()
                )->values()->all(),
            ])->values()->all(),
        ];

        $relativePath = 'import-backups/solar-readings-before-'.now()->format('Ymd-His-u').'-'.substr($validated['hash'], 0, 8).'.json';
        $json = json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (! Storage::disk('local')->put($relativePath, $json)) {
            throw new RuntimeException('Could not write the private pre-import backup. No readings were changed.');
        }

        return $relativePath;
    }

    private function verifyStoredData(array $validated): void
    {
        $companyIds = collect($validated['companies'])->pluck('company_id')->all();
        $stored = DailyReading::query()
            ->with('outputs')
            ->whereIn('company_id', $companyIds)
            ->orderBy('company_id')
            ->orderBy('reading_date')
            ->get();

        if ($stored->count() !== self::EXPECTED_READING_COUNT || $stored->sum(fn ($reading) => $reading->outputs->count()) !== self::EXPECTED_OUTPUT_COUNT) {
            throw new RuntimeException('Post-import row counts do not match the validated workbook.');
        }

        $storedByKey = $stored->keyBy(fn (DailyReading $reading) => $reading->company_id.'|'.$reading->reading_date->format('Y-m-d'));
        foreach ($validated['companies'] as $companyData) {
            $company = Company::findOrFail($companyData['company_id']);
            $previous = [];
            foreach ($companyData['rows'] as $index => $expected) {
                $key = $companyData['company_id'].'|'.$expected['date'];
                /** @var DailyReading|null $actual */
                $actual = $storedByKey->get($key);
                if (! $actual) {
                    throw new RuntimeException("Missing stored reading: {$key}");
                }

                foreach (self::METER_HEADERS as $field => $_aliases) {
                    if (abs((float) $actual->{$field} - $expected[$field]) > 0.0001) {
                        throw new RuntimeException("Stored meter value differs from workbook: {$key} {$field}");
                    }

                    $meter = str_replace('_reading', '', $field);
                    $unitField = $meter.'_unit';
                    if ($index === 0) {
                        if ($actual->{$unitField} !== null) {
                            throw new RuntimeException("First-day unit must be null: {$key} {$unitField}");
                        }
                    } else {
                        $expectedUnit = round(($expected[$field] - $previous[$field]) * (float) $company->{$meter.'_multiplier'}, 2);
                        if ($actual->{$unitField} === null || abs((float) $actual->{$unitField} - $expectedUnit) > 0.001) {
                            throw new RuntimeException("Calculated unit differs from configured multiplier: {$key} {$unitField}");
                        }
                    }
                    $previous[$field] = $expected[$field];
                }

                $actualOutputs = $actual->outputs->keyBy('inverter_id');
                foreach ($expected['inverters'] as $inverterId => $generation) {
                    $actualOutput = $actualOutputs->get($inverterId);
                    if ($generation === null) {
                        if ($actualOutput !== null) {
                            throw new RuntimeException("Null workbook inverter cell created an output row: {$key}|{$inverterId}");
                        }
                    } elseif (! $actualOutput || abs((float) $actualOutput->generation - $generation) > 0.001) {
                        throw new RuntimeException("Stored inverter value differs from workbook: {$key}|{$inverterId}");
                    }
                }
            }
        }

        if (DailyReading::whereIn('company_id', $companyIds)->whereIn('reading_date', ['2026-07-31', '2026-09-20'])->exists()) {
            throw new RuntimeException('Out-of-scope 31 July or 20 September readings remain after replacement.');
        }
    }

    private function summary(array $validated): array
    {
        return [
            'workbook_name' => basename($validated['path']),
            'workbook_sha256' => $validated['hash'],
            'date_start' => $validated['date_start'],
            'date_end' => $validated['date_end'],
            'reading_count' => $validated['reading_count'],
            'inverter_output_count' => $validated['inverter_output_count'],
            'companies' => collect($validated['companies'])->map(fn (array $company) => [
                'company_id' => $company['company_id'],
                'company_name' => $company['company_name'],
                'sheet_name' => $company['sheet_name'],
                'reading_count' => $company['reading_count'],
                'inverter_output_count' => $company['inverter_output_count'],
            ])->values()->all(),
        ];
    }

    private function normalize(string $value): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', $value)));
    }

    private function normalizeHeader(string $value): string
    {
        return strtolower(preg_replace('/[^a-z0-9]+/i', '', trim($value)));
    }
}
