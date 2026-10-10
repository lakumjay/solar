<?php

namespace App\Services;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use Carbon\Carbon;
use Carbon\CarbonPeriod;

class AttendanceReportService
{
    public function build(string $month, ?int $employeeId = null): array
    {
        $start = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
        $end = $start->copy()->endOfMonth();
        $employees = Employee::with('user:id,name,email')
            ->when($employeeId, fn ($query) => $query->whereKey($employeeId))->orderBy('employee_code')->get();
        $records = AttendanceRecord::with(['recordedBy:id,name', 'breaks'])->whereBetween('attendance_date', [$start, $end])->get()->groupBy('employee_id');
        $holidays = Holiday::where('active', true)->whereBetween('holiday_date', [$start, $end])->get()->keyBy(fn ($item) => $item->holiday_date->toDateString());
        $leaves = LeaveRequest::with('leaveType:id,name,paid')->where('status', 'approved')
            ->whereDate('date_from', '<=', $end)->whereDate('date_to', '>=', $start)->get()->groupBy('employee_id');
        $rows = [];

        foreach ($employees as $employee) {
            $summary = ['scheduled_days' => 0, 'present' => 0.0, 'half_days' => 0, 'short_days' => 0, 'absent' => 0.0, 'leave' => 0.0, 'holidays' => 0.0, 'weekly_offs' => 0, 'late' => 0, 'early_out' => 0, 'missing_clock_out' => 0, 'manual_corrections' => 0, 'work_minutes' => 0, 'break_minutes' => 0, 'overtime_minutes' => 0, 'urgent_out_count' => 0, 'urgent_out_deduction' => 0.0];
            $days = [];
            foreach (CarbonPeriod::create($start, $end) as $date) {
                $dateString = $date->toDateString();
                $record = $records->get($employee->id, collect())->first(fn ($item) => $item->attendance_date->toDateString() === $dateString);
                $holiday = $holidays->get($dateString);
                $leave = $leaves->get($employee->id, collect())->first(fn ($item) => $item->date_from->lte($date) && $item->date_to->gte($date));
                $weeklyOff = in_array($date->dayOfWeek, $employee->weekly_offs ?? [], true);
                $dayStatus = 'absent';

                $urgentDeduction = 0.0;
                $urgentCount = 0;
                $dayBreaks = [];

                if ($record) {
                    $dayStatus = $record->clock_out_at ? $record->status : 'missing_clock_out';
                    $halfLeave = $leave && $leave->day_part !== 'full_day';
                    $halfHoliday = $holiday && $holiday->type !== 'full_day';
                    if (! $record->clock_out_at) {
                        $summary['missing_clock_out']++;
                    } elseif ($record->status === 'half_day') {
                        $summary['half_days']++;
                    } elseif ($record->status === 'short_day') {
                        $summary['short_days']++;
                    } else {
                        $summary['present'] += ($halfLeave || $halfHoliday) ? .5 : 1;
                    }
                    if ($halfLeave) {
                        $summary['leave'] += .5;
                    } elseif ($halfHoliday) {
                        $summary['holidays'] += .5;
                    }
                    if ($record->is_late) {
                        $summary['late']++;
                    }
                    if ($record->is_early_out) {
                        $summary['early_out']++;
                    }
                    if ($record->manual_correction) {
                        $summary['manual_corrections']++;
                    }
                    $summary['work_minutes'] += $record->work_minutes;
                    $summary['break_minutes'] += $record->break_minutes;
                    $summary['overtime_minutes'] += $record->overtime_minutes;

                    if ($record->breaks) {
                        foreach ($record->breaks as $brk) {
                            $isUrgent = ($brk->break_type === 'urgent_out');
                            if ($isUrgent) {
                                $urgentCount++;
                                $summary['urgent_out_count']++;
                                if (! $brk->admin_waived && $brk->deduction_amount > 0) {
                                    $urgentDeduction += (float) $brk->deduction_amount;
                                    $summary['urgent_out_deduction'] += (float) $brk->deduction_amount;
                                }
                            }
                            $dayBreaks[] = [
                                'id' => $brk->id,
                                'break_type' => $brk->break_type ?? 'regular',
                                'started_at' => $brk->started_at?->format('h:i A'),
                                'ended_at' => $brk->ended_at?->format('h:i A'),
                                'duration_minutes' => (int) $brk->duration_minutes,
                                'out_reason' => $brk->out_reason,
                                'out_selfie_url' => $brk->out_selfie_url,
                                'return_selfie_url' => $brk->return_selfie_url,
                                'deduction_amount' => (float) $brk->deduction_amount,
                                'is_deducted' => (bool) $brk->is_deducted,
                                'admin_waived' => (bool) $brk->admin_waived,
                                'waive_reason' => $brk->waive_reason,
                            ];
                        }
                    }
                } elseif ($leave) {
                    $portion = $leave->day_part === 'full_day' ? 1 : .5;
                    $summary['leave'] += $portion;
                    if ($portion === .5) {
                        $summary['absent'] += .5;
                    }
                    $dayStatus = 'leave'.($portion === .5 ? '_half' : '');
                } elseif ($holiday) {
                    $portion = $holiday->type === 'full_day' ? 1 : .5;
                    $summary['holidays'] += $portion;
                    if ($portion === .5) {
                        $summary['absent'] += .5;
                    }
                    $dayStatus = $portion === 1.0 ? 'holiday' : 'half_day_holiday';
                } elseif ($weeklyOff) {
                    $summary['weekly_offs']++;
                    $dayStatus = 'weekly_off';
                } elseif ($date->lte(now()->startOfDay())) {
                    $summary['absent']++;
                } else {
                    $dayStatus = 'upcoming';
                }
                if (! $weeklyOff && ! ($holiday?->type === 'full_day')) {
                    $summary['scheduled_days']++;
                }
                $days[] = [
                    'date' => $dateString, 'status' => $dayStatus,
                    'clock_in' => $record?->clock_in_at?->format('h:i A'), 'clock_out' => $record?->clock_out_at?->format('h:i A'),
                    'work_minutes' => $record?->work_minutes ?? 0, 'break_minutes' => $record?->break_minutes ?? 0,
                    'work_done' => $record?->work_done, 'learned' => $record?->learned,
                    'entry_source' => $record?->entry_source,
                    'recorded_by' => $record?->recordedBy?->name,
                    'entry_reason' => $record?->entry_reason,
                    'urgent_out_count' => $urgentCount,
                    'urgent_deduction' => round($urgentDeduction, 2),
                    'breaks' => $dayBreaks,
                ];
            }
            $rows[] = ['employee' => $employee, 'summary' => $summary, 'days' => $days];
        }

        return ['month' => $month, 'from' => $start->toDateString(), 'to' => $end->toDateString(), 'rows' => $rows];
    }
}
