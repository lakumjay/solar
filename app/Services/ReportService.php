<?php

namespace App\Services;

use App\Models\Company;
use App\Models\DailyReading;
use App\Models\Inverter;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class ReportService
{
    public function __construct(private readonly ReadingCalculationService $calculator) {}

    public function build(?int $companyId, string $period, Carbon $from, Carbon $to): array
    {
        $reference = $this->referenceCompany($companyId === null);
        $query = DailyReading::with(['outputs', 'company:id,name'])
            ->whereBetween('reading_date', [$from->copy()->startOfDay(), $to->copy()->endOfDay()]);

        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        $rows = $query->orderBy('reading_date')->get();
        $grouped = $rows->groupBy(function ($row) use ($period) {
            $date = Carbon::parse($row->reading_date);

            return match ($period) {
                'weekly' => $date->copy()->startOfWeek(Carbon::MONDAY)->toDateString(),
                'monthly' => $date->format('Y-m'),
                default => $date->toDateString(),
            };
        })->map(function ($items, $key) use ($companyId, $reference) {
            $totals = $this->calculator->totals($items);
            if ($companyId === null) {
                $totals['sub_import'] = round($items->where('company_id', $reference->id)->sum('sub_import_unit'), 2);
            }

            return [
                'period' => $key,
                'company_count' => $items->pluck('company_id')->unique()->count(),
                ...$totals,
            ];
        })->values();

        $companyTotals = $rows->groupBy('company_id')->map(fn ($items) => [
            'company_id' => $items->first()->company_id,
            'company' => $items->first()->company?->name,
            ...$this->calculator->totals($items),
        ])->sortBy('company')->values();

        $outputs = $rows->flatMap(fn ($row) => $row->outputs);
        $inverters = Inverter::with('company:id,name')->whereIn('id', $outputs->pluck('inverter_id')->unique())->get()->keyBy('id');
        $inverterTotals = $outputs->groupBy('inverter_id')->map(function ($items, $inverterId) use ($inverters) {
            $inverter = $inverters->get($inverterId);

            return [
                'inverter_id' => (int) $inverterId,
                'company' => $inverter?->company?->name,
                'inverter' => $inverter?->name,
                'generation' => round($items->sum('generation'), 2),
            ];
        })->sortBy(fn ($item) => ($item['company'] ?? '').' '.($item['inverter'] ?? ''))->values();

        $grandTotal = $this->calculator->totals($rows);
        $referenceRows = $rows;
        if ($companyId === null) {
            $grandTotal['sub_import'] = round($rows->where('company_id', $reference->id)->sum('sub_import_unit'), 2);
        } elseif ($reference) {
            $referenceRows = DailyReading::query()
                ->whereBetween('reading_date', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])
                ->get(['company_id', 'reading_date']);
        }
        $missingDates = $reference ? $this->missingReferenceDates($referenceRows, $reference->id) : [];

        return [
            'period' => $period,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'is_combined' => ! $companyId,
            'rows' => $grouped->all(),
            'company_totals' => $companyTotals->all(),
            'inverter_totals' => $inverterTotals->all(),
            'grand_total' => $grandTotal,
            'ss_reference' => $reference ? [
                'company_id' => $reference->id,
                'company' => $reference->name,
                'missing_dates' => $missingDates,
            ] : null,
        ];
    }

    /**
     * Build the Daily SS report from the calculated 66kV Sub Import Units.
     */
    public function dailySs(Carbon $from, Carbon $to): array
    {
        $reference = $this->referenceCompany(true);
        $sourceRows = DailyReading::query()
            ->whereBetween('reading_date', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])
            ->orderBy('reading_date')
            ->get();
        $rows = $sourceRows
            ->groupBy(fn (DailyReading $reading) => $reading->reading_date->toDateString())
            ->map(fn ($readings, string $date) => [
                'date' => $date,
                'daily_ss_reading' => round($readings->where('company_id', $reference->id)->sum('sub_import_unit'), 2),
            ])
            ->values();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows->all(),
            'ss_reference' => [
                'company_id' => $reference->id,
                'company' => $reference->name,
                'missing_dates' => $this->missingReferenceDates($sourceRows, $reference->id),
            ],
        ];
    }

    private function referenceCompany(bool $required): ?Company
    {
        $reference = Company::query()
            ->where('active', true)
            ->where('is_ss_reference', true)
            ->first();

        abort_if($required && ! $reference, 422, 'No active Daily SS reference company is configured.');

        return $reference;
    }

    private function missingReferenceDates(Collection $rows, int $referenceCompanyId): array
    {
        return $rows
            ->groupBy(fn (DailyReading $reading) => $reading->reading_date->toDateString())
            ->filter(fn (Collection $readings) => ! $readings->contains(
                fn (DailyReading $reading) => $reading->company_id === $referenceCompanyId
            ))
            ->keys()
            ->sort()
            ->values()
            ->all();
    }
}
