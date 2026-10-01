<?php

namespace App\Services;

use App\Models\DailyReading;
use App\Models\Inverter;
use Carbon\Carbon;

class ReportService
{
    public function __construct(private readonly ReadingCalculationService $calculator) {}

    public function build(?int $companyId, string $period, Carbon $from, Carbon $to): array
    {
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
        })->map(fn ($items, $key) => [
            'period' => $key,
            'company_count' => $items->pluck('company_id')->unique()->count(),
            ...$this->calculator->totals($items),
        ])->values();

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

        return [
            'period' => $period,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'is_combined' => ! $companyId,
            'rows' => $grouped->all(),
            'company_totals' => $companyTotals->all(),
            'inverter_totals' => $inverterTotals->all(),
            'grand_total' => $this->calculator->totals($rows),
        ];
    }
}
