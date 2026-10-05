<?php

namespace App\Services;

use App\Models\Company;
use App\Models\DailyReading;

class ReadingCalculationService
{
    public const METERS = [
        'plant_import' => 'plant_import_multiplier',
        'plant_export' => 'plant_export_multiplier',
        'sub_import' => 'sub_import_multiplier',
        'sub_export' => 'sub_export_multiplier',
    ];

    public function recalculate(int $companyId): void
    {
        $company = Company::findOrFail($companyId);
        $previous = [];

        foreach (DailyReading::where('company_id', $companyId)->orderBy('reading_date')->get() as $row) {
            foreach (self::METERS as $meter => $multiplier) {
                $reading = $row->{$meter.'_reading'};
                $mult = (float) ($company->$multiplier ?? 1.0);

                if ($reading !== null && (float) $reading > 0) {
                    $readingVal = (float) $reading;
                    if (isset($previous[$meter]) && (float) $previous[$meter] > 0) {
                        $diff = $readingVal - (float) $previous[$meter];
                        // Only save valid non-negative differences. If diff is negative (meter typo or invalid reading), set null to prevent negative corruption.
                        $row->{$meter.'_unit'} = $diff >= 0 ? round($diff * $mult, 2) : null;
                    } else {
                        // Baseline first reading: unit is null
                        $row->{$meter.'_unit'} = null;
                    }
                    $previous[$meter] = $readingVal;
                } else {
                    // Blank/skipped reading: units is null, do NOT overwrite previous baseline
                    $row->{$meter.'_unit'} = null;
                }
            }

            $row->saveQuietly();
        }
    }

    public function totals($rows): array
    {
        return [
            'generation' => round($rows->sum(fn ($row) => $row->outputs->sum('generation')), 2),
            'plant_import' => round($rows->sum('plant_import_unit'), 2),
            'plant_export' => round($rows->sum('plant_export_unit'), 2),
            'sub_import' => round($rows->sum('sub_import_unit'), 2),
            'sub_export' => round($rows->sum('sub_export_unit'), 2),
        ];
    }
}
