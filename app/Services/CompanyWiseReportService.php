<?php

namespace App\Services;

use App\Models\Company;
use App\Models\DailyReading;
use Carbon\Carbon;

class CompanyWiseReportService
{
    public const METER_COLUMNS = [
        'plant_import_reading' => ['label' => 'Plant Import Reading', 'group' => 'plant_import'],
        'plant_import_unit' => ['label' => 'Plant Import Unit', 'group' => 'plant_import'],
        'plant_export_reading' => ['label' => 'Plant Export Reading', 'group' => 'plant_export'],
        'plant_export_unit' => ['label' => 'Plant Export Unit', 'group' => 'plant_export'],
        'sub_import_reading' => ['label' => '66kV Sub Import Reading', 'group' => 'sub_import'],
        'sub_import_unit' => ['label' => '66kV Sub Import Unit', 'group' => 'sub_import'],
        'sub_export_reading' => ['label' => '66kV Sub Export Reading', 'group' => 'sub_export'],
        'sub_export_unit' => ['label' => '66kV Sub Export Unit', 'group' => 'sub_export'],
    ];

    public function build(int $companyId, Carbon $from, Carbon $to, array $inverterIds, array $meterColumns): array
    {
        $company = Company::findOrFail($companyId);
        $inverters = $company->inverters()
            ->whereIn('id', $inverterIds)
            ->orderBy('id')
            ->get(['id', 'name']);
        $selectedMeters = collect(self::METER_COLUMNS)->only($meterColumns);

        $rows = DailyReading::with(['outputs' => fn ($query) => $query->whereIn('inverter_id', $inverterIds)])
            ->where('company_id', $companyId)
            ->whereBetween('reading_date', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])
            ->orderBy('reading_date')
            ->get()
            ->map(function (DailyReading $reading) use ($selectedMeters) {
                return [
                    'date' => $reading->reading_date->toDateString(),
                    'inverters' => $reading->outputs->mapWithKeys(fn ($output) => [
                        (string) $output->inverter_id => (float) $output->generation,
                    ])->all(),
                    'meters' => $selectedMeters->keys()->mapWithKeys(fn (string $column) => [
                        $column => $reading->$column === null ? null : (float) $reading->$column,
                    ])->all(),
                ];
            });

        return [
            'company' => ['id' => $company->id, 'name' => $company->name],
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'inverters' => $inverters->map(fn ($inverter) => ['id' => $inverter->id, 'name' => $inverter->name])->all(),
            'meter_columns' => $selectedMeters->map(fn (array $definition, string $key) => [
                'key' => $key,
                ...$definition,
            ])->values()->all(),
            'rows' => $rows->all(),
        ];
    }
}
