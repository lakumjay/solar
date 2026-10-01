<?php

namespace App\Services;

use App\Models\Company;
use App\Models\DailyInverterOutput;
use App\Models\DailyReading;
use App\Models\Inverter;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

class ExcelImportService
{
    public function __construct(
        private readonly ReadingCalculationService $calculator,
        private readonly ActivityLogger $activity,
    ) {}

    public function import(UploadedFile $file, User $actor): array
    {
        $book = IOFactory::load($file->getRealPath());
        $companies = Company::with('inverters')->get()->keyBy(fn (Company $company) => $this->normaliseLabel($company->name));
        $imported = 0;
        $skipped = 0;
        $details = [];

        DB::transaction(function () use ($actor, $book, $companies, &$imported, &$skipped, &$details) {
            foreach ($book->getWorksheetIterator() as $sheet) {
                $company = $companies->get($this->normaliseLabel($sheet->getTitle()));
                if (! $company) {
                    $details[] = $sheet->getTitle().': company not found';

                    continue;
                }

                $headers = [];
                foreach ($sheet->getRowIterator(3, 3)->current()->getCellIterator() as $cell) {
                    $headers[$cell->getColumn()] = $this->normaliseLabel((string) $cell->getValue());
                }

                $inverterColumns = [];
                foreach ($headers as $column => $header) {
                    if (preg_match('/^inverter(\d+)$/', $header, $match)) {
                        $inverterColumns[$column] = (int) $match[1];
                    }
                }

                $columns = $this->readingColumns($headers);
                $sheetCount = 0;
                for ($row = 5; $row <= $sheet->getHighestDataRow(); $row++) {
                    $date = $this->excelDate($sheet->getCell("A{$row}"));
                    $values = [];
                    foreach ($columns as $field => $column) {
                        $values[$field] = $this->numericOrNull($sheet->getCell("{$column}{$row}")->getCalculatedValue());
                    }

                    $outputs = [];
                    foreach ($inverterColumns as $column => $position) {
                        $generation = $this->numericOrNull($sheet->getCell("{$column}{$row}")->getCalculatedValue());
                        $inverter = $company->inverters->first(fn (Inverter $item) => $this->normaliseLabel($item->name) === 'inverter'.$position);
                        if ($generation !== null && $inverter) {
                            $outputs[] = ['inverter_id' => $inverter->id, 'generation' => $generation];
                        }
                    }

                    if (! $date || (! array_filter($values, fn ($value) => $value !== null) && ! count($outputs))) {
                        $skipped++;

                        continue;
                    }

                    $existing = DailyReading::where('company_id', $company->id)->where('reading_date', $date)->first();
                    $reading = DailyReading::updateOrCreate(
                        ['company_id' => $company->id, 'reading_date' => $date],
                        $values + ['created_by' => $existing?->created_by ?? $actor->id, 'updated_by' => $actor->id],
                    );

                    if ($outputs) {
                        $reading->outputs()->delete();
                        foreach ($outputs as $output) {
                            DailyInverterOutput::create(['daily_reading_id' => $reading->id] + $output);
                        }
                    }

                    $sheetCount++;
                    $imported++;
                }

                $this->calculator->recalculate($company->id);
                $details[] = $company->name.": {$sheetCount} rows imported";
            }

            $this->activity->log($actor, null, 'imported', 'excel', null, "Imported {$imported} daily rows from Excel", ['details' => $details]);
        });

        $book->disconnectWorksheets();

        return [
            'message' => "{$imported} daily rows imported. Units were recalculated from raw readings.",
            'imported' => $imported,
            'skipped' => $skipped,
            'details' => $details,
        ];
    }

    private function normaliseLabel(string $value): string
    {
        return strtolower((string) preg_replace('/[^a-zA-Z0-9]+/', '', trim($value)));
    }

    private function readingColumns(array $headers): array
    {
        $aliases = [
            'plant_import_reading' => ['plantimportreading', 'plantimportreding'],
            'plant_export_reading' => ['plantexportreading', 'plantexportreding'],
            'sub_import_reading' => ['66kvsubimportreading', '66kvsubimportreding'],
            'sub_export_reading' => ['66kvsubexportreading', '66kvsubexportreding'],
        ];
        $result = [];

        foreach ($aliases as $field => $options) {
            $column = array_search(true, array_map(fn ($header) => in_array($header, $options, true), $headers), true);
            if ($column !== false) {
                $result[$field] = $column;
            }
        }

        return $result;
    }

    private function numericOrNull(mixed $value): ?float
    {
        if ($value === null || trim((string) $value) === '' || trim((string) $value) === '-') {
            return null;
        }

        return is_numeric($value) ? round((float) $value, 2) : null;
    }

    private function excelDate($cell): ?Carbon
    {
        $value = $cell->getValue();
        if ($value instanceof \DateTimeInterface) {
            return Carbon::instance(\DateTimeImmutable::createFromInterface($value))->startOfDay();
        }
        if (is_numeric($value) && ExcelDate::isDateTime($cell)) {
            return Carbon::instance(ExcelDate::excelToDateTimeObject((float) $value))->startOfDay();
        }

        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        foreach (['d/m/Y', 'd/m/y', 'Y-m-d'] as $format) {
            try {
                $date = Carbon::createFromFormat($format, $value);
                if ($date && $date->format($format) === $value) {
                    return $date->startOfDay();
                }
            } catch (\Throwable) {
            }
        }

        return null;
    }
}
