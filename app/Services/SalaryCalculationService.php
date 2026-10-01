<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\SalaryAdjustment;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class SalaryCalculationService
{
    public function __construct(private readonly AttendanceReportService $attendanceReports) {}

    public function report(string $month, ?Employee $onlyEmployee = null): array
    {
        [$start, $end] = $this->monthRange($month);
        $employees = Employee::with([
            'user:id,name',
            'salaryRates' => fn ($query) => $query->whereDate('effective_month', '<=', $start)->with('creator:id,name'),
        ])->when($onlyEmployee, fn ($query) => $query->whereKey($onlyEmployee->id))
            ->where(fn ($query) => $query->whereNull('joining_date')->orWhereDate('joining_date', '<=', $end))
            ->orderBy('employee_code')->get();

        $employeeIds = $employees->pluck('id');
        $adjustments = SalaryAdjustment::with(['creator:id,name', 'canceller:id,name'])
            ->whereIn('employee_id', $employeeIds)
            ->whereDate('salary_month', $start)
            ->orderBy('created_at')->orderBy('id')->get()->groupBy('employee_id');
        $holidays = Holiday::where('active', true)->whereBetween('holiday_date', [$start, $end])
            ->get()->keyBy(fn (Holiday $holiday) => $holiday->holiday_date->toDateString());
        $leaves = LeaveRequest::whereIn('employee_id', $employeeIds)->where('status', 'approved')
            ->whereDate('date_from', '<=', $end)->whereDate('date_to', '>=', $start)
            ->get()->groupBy('employee_id');
        $attendance = collect($this->attendanceReports->build($month, $onlyEmployee?->id)['rows'])->keyBy(fn ($row) => $row['employee']->id);

        $rows = $employees->map(fn (Employee $employee) => $this->calculateEmployee(
            $employee,
            $start,
            $end,
            $holidays,
            $leaves->get($employee->id, collect()),
            $adjustments->get($employee->id, collect()),
            $attendance->get($employee->id),
        ))->values();

        $totals = [
            'configured_employees' => $rows->where('configured', true)->count(),
            'unconfigured_employees' => $rows->where('configured', false)->count(),
            'base_salary' => $this->sumMoney($rows, 'monthly_salary'),
            'prorated_gross' => $this->sumMoney($rows, 'prorated_gross'),
            'leave_deduction' => $this->sumMoney($rows, 'leave_deduction'),
            'additions' => $this->sumMoney($rows, 'additions'),
            'deductions' => $this->sumMoney($rows, 'deductions'),
            'final_payable' => $this->sumMoney($rows, 'final_payable'),
        ];

        return [
            'month' => $month,
            'from' => $start->toDateString(),
            'to' => $end->toDateString(),
            'period_status' => $start->isSameMonth(now()) ? 'provisional' : 'final_calculation',
            'totals' => $totals,
            'rows' => $rows->all(),
        ];
    }

    public function assertAllowedMonth(string $month): Carbon
    {
        [$start] = $this->monthRange($month);
        if ($start->isAfter(now()->startOfMonth())) {
            throw ValidationException::withMessages(['month' => 'Future salary months are not allowed.']);
        }

        return $start;
    }

    private function monthRange(string $month): array
    {
        try {
            $start = Carbon::createFromFormat('Y-m-d', $month.'-01')->startOfMonth();
        } catch (\Throwable) {
            throw ValidationException::withMessages(['month' => 'The month must use YYYY-MM format.']);
        }
        if ($start->format('Y-m') !== $month) {
            throw ValidationException::withMessages(['month' => 'The month must use YYYY-MM format.']);
        }
        if ($start->isAfter(now()->startOfMonth())) {
            throw ValidationException::withMessages(['month' => 'Future salary months are not allowed.']);
        }

        return [$start, $start->copy()->endOfMonth()];
    }

    private function calculateEmployee(
        Employee $employee,
        Carbon $start,
        Carbon $end,
        Collection $holidays,
        Collection $leaves,
        Collection $adjustments,
        ?array $attendance,
    ): array {
        $rate = $employee->salaryRates->sortByDesc('effective_month')->first();
        $monthlyCents = $rate ? $this->toCents($rate->monthly_salary) : 0;
        $scheduledHalfUnits = 0;
        $eligibleHalfUnits = 0;
        $leaveHalfUnits = 0;
        $joiningDate = $employee->joining_date?->copy()->startOfDay();
        $attendanceDays = collect($attendance['days'] ?? [])->keyBy('date');
        $daily = [];

        foreach (CarbonPeriod::create($start, $end) as $date) {
            $dateString = $date->toDateString();
            $holiday = $holidays->get($dateString);
            $weeklyOff = in_array($date->dayOfWeek, $employee->weekly_offs ?? [], true);
            $scheduleUnits = $weeklyOff || $holiday?->type === 'full_day' ? 0 : ($holiday ? 1 : 2);
            $eligible = ! $joiningDate || $date->gte($joiningDate);
            $leave = $leaves->first(fn (LeaveRequest $item) => $item->date_from->lte($date) && $item->date_to->gte($date));
            $deductibleUnits = $eligible ? $this->deductibleLeaveUnits($leave, $holiday, $scheduleUnits) : 0;

            $scheduledHalfUnits += $scheduleUnits;
            if ($eligible) {
                $eligibleHalfUnits += $scheduleUnits;
                $leaveHalfUnits += $deductibleUnits;
            }

            $attendanceDay = $attendanceDays->get($dateString, []);
            $daily[] = [
                'date' => $dateString,
                'status' => $attendanceDay['status'] ?? ($eligible ? 'absent' : 'before_joining'),
                'scheduled_units' => $scheduleUnits / 2,
                'leave_units' => $deductibleUnits / 2,
                'leave_part' => $leave?->day_part,
                'holiday' => $holiday?->name,
                'holiday_type' => $holiday?->type,
                'weekly_off' => $weeklyOff,
                'clock_in' => $attendanceDay['clock_in'] ?? null,
                'clock_out' => $attendanceDay['clock_out'] ?? null,
            ];
        }

        $grossCents = $rate && $scheduledHalfUnits > 0
            ? (int) round($monthlyCents * $eligibleHalfUnits / $scheduledHalfUnits, 0, PHP_ROUND_HALF_UP)
            : 0;
        $leaveCents = $rate && $scheduledHalfUnits > 0
            ? (int) round($monthlyCents * $leaveHalfUnits / $scheduledHalfUnits, 0, PHP_ROUND_HALF_UP)
            : 0;
        $activeAdjustments = $adjustments->whereNull('cancelled_at');
        $additionCents = $activeAdjustments->where('type', 'addition')->sum(fn (SalaryAdjustment $item) => $this->toCents($item->amount));
        $deductionCents = $activeAdjustments->where('type', 'deduction')->sum(fn (SalaryAdjustment $item) => $this->toCents($item->amount));
        $finalCents = max(0, $grossCents - $leaveCents + $additionCents - $deductionCents);
        $summary = $attendance['summary'] ?? [];

        return [
            'employee' => [
                'id' => $employee->id,
                'employee_code' => $employee->employee_code,
                'name' => $employee->user->name,
                'active' => $employee->active,
                'joining_date' => $employee->joining_date?->toDateString(),
            ],
            'configured' => (bool) $rate,
            'rate' => $rate ? [
                'id' => $rate->id,
                'effective_month' => $rate->effective_month->format('Y-m'),
                'monthly_salary' => $this->money($monthlyCents),
                'created_by' => $rate->creator?->name,
            ] : null,
            'monthly_salary' => $this->money($monthlyCents),
            'scheduled_units' => $scheduledHalfUnits / 2,
            'eligible_units' => $eligibleHalfUnits / 2,
            'leave_units' => $leaveHalfUnits / 2,
            'daily_rate' => $scheduledHalfUnits ? $this->money((int) round($monthlyCents * 2 / $scheduledHalfUnits)) : 0.00,
            'prorated_gross' => $this->money($grossCents),
            'leave_deduction' => $this->money($leaveCents),
            'additions' => $this->money($additionCents),
            'deductions' => $this->money($deductionCents),
            'final_payable' => $this->money($finalCents),
            'attendance' => [
                'present' => (float) ($summary['present'] ?? 0),
                'half_days' => (int) ($summary['half_days'] ?? 0),
                'short_days' => (int) ($summary['short_days'] ?? 0),
                'absent' => (float) ($summary['absent'] ?? 0),
                'approved_leave' => (float) ($summary['leave'] ?? 0),
                'holidays' => (float) ($summary['holidays'] ?? 0),
                'weekly_offs' => (int) ($summary['weekly_offs'] ?? 0),
            ],
            'adjustments' => $adjustments->map(fn (SalaryAdjustment $item) => [
                'id' => $item->id,
                'type' => $item->type,
                'amount' => $this->money($this->toCents($item->amount)),
                'reason' => $item->reason,
                'created_at' => $item->created_at?->toIso8601String(),
                'created_by' => $item->creator?->name,
                'cancelled' => (bool) $item->cancelled_at,
                'cancelled_at' => $item->cancelled_at?->toIso8601String(),
                'cancelled_by' => $item->canceller?->name,
                'cancellation_reason' => $item->cancellation_reason,
                'replaces_adjustment_id' => $item->replaces_adjustment_id,
            ])->values()->all(),
            'days' => $daily,
        ];
    }

    private function deductibleLeaveUnits(?LeaveRequest $leave, ?Holiday $holiday, int $scheduleUnits): int
    {
        if (! $leave || $scheduleUnits === 0) {
            return 0;
        }
        if ($leave->day_part === 'full_day') {
            return $scheduleUnits;
        }
        if (! $holiday || $holiday->type === 'full_day') {
            return min(1, $scheduleUnits);
        }

        return $leave->day_part === $holiday->type ? 0 : min(1, $scheduleUnits);
    }

    private function sumMoney(Collection $rows, string $field): float
    {
        return $this->money($rows->sum(fn ($row) => $this->toCents($row[$field])));
    }

    private function toCents(string|float|int $amount): int
    {
        return (int) round((float) $amount * 100, 0, PHP_ROUND_HALF_UP);
    }

    private function money(int $cents): float
    {
        return round($cents / 100, 2);
    }
}
