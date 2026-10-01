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
                $row->{$meter.'_unit'} = ($reading !== null && array_key_exists($meter, $previous))
                    ? round(((float) $reading - (float) $previous[$meter]) * (float) $company->$multiplier, 2)
                    : null;

                if ($reading !== null) {
                    $previous[$meter] = $reading;
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
