<?php

namespace App\Services;

use App\Models\AttendanceAdjustment;
use App\Models\AttendanceBreak;
use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AttendanceService
{
    public function __construct(private readonly ActivityLogger $activity) {}

    public function employeeFor(User $user): Employee
    {
        $employee = $user->employee;
        abort_unless($user->role === 'employee' && $employee && $employee->active && $user->active, 403, 'Active employee access is required.');

        return $employee;
    }

    public function dayContext(Employee $employee, Carbon $date): array
    {
        $day = $date->toDateString();
        $holiday = Holiday::whereDate('holiday_date', $day)->where('active', true)->first();
        $leave = LeaveRequest::with('leaveType:id,name,paid')->where('employee_id', $employee->id)
            ->where('status', 'approved')->whereDate('date_from', '<=', $day)->whereDate('date_to', '>=', $day)->first();
        $weeklyOff = in_array($date->dayOfWeek, $employee->weekly_offs ?? [], true);

        return compact('holiday', 'leave', 'weeklyOff');
    }

    public function clockIn(Employee $employee, array $data, UploadedFile $selfie): AttendanceRecord
    {
        $this->requireSelfClocking($employee);
        $now = now();
        $context = $this->dayContext($employee, $now);
        if ($context['holiday']?->type === 'full_day') {
            throw ValidationException::withMessages(['attendance' => "Today is {$context['holiday']->name}, a full-day holiday."]);
        }
        if ($context['weeklyOff']) {
            throw ValidationException::withMessages(['attendance' => 'Today is your weekly off.']);
        }
        if ($context['leave']?->day_part === 'full_day') {
            throw ValidationException::withMessages(['attendance' => 'You have approved leave today.']);
        }

        $date = $now->toDateString();
        if (AttendanceRecord::where('employee_id', $employee->id)->whereDate('attendance_date', $date)->exists()) {
            throw ValidationException::withMessages(['attendance' => 'Attendance is already started for today.']);
        }

        $selfiePath = $selfie->store('attendance-selfies/'.$now->format('Y/m'));
        $shiftStart = Carbon::parse($date.' '.$employee->shift_start)->addMinutes($employee->grace_minutes);
        if ($context['holiday']?->type === 'first_half' || $context['leave']?->day_part === 'first_half') {
            $shiftStart->addMinutes($employee->half_day_minutes);
        }

        $geofenceAlert = null;
        try {
            $company = $employee->user?->company ?: \App\Models\Company::where('active', true)->whereNotNull('latitude')->first();
            if ($company && !empty($company->latitude) && !empty($company->longitude) && !empty($data['latitude']) && !empty($data['longitude'])) {
                $earthRadius = 6371000;
                $latFrom = deg2rad((float)$company->latitude);
                $lonFrom = deg2rad((float)$company->longitude);
                $latTo = deg2rad((float)$data['latitude']);
                $lonTo = deg2rad((float)$data['longitude']);
                $latDelta = $latTo - $latFrom;
                $lonDelta = $lonTo - $lonFrom;
                $angle = 2 * asin(sqrt(pow(sin($latDelta / 2), 2) + cos($latFrom) * cos($latTo) * pow(sin($lonDelta / 2), 2)));
                $distanceMeters = $angle * $earthRadius;
                $allowedRadius = (float)env('GEOFENCE_RADIUS_METERS', 1500);
                if ($distanceMeters > $allowedRadius) {
                    $km = round($distanceMeters / 1000, 1);
                    $geofenceAlert = "⚠️ Geofence: Punched {$km} km away from plant ({$company->name})";
                }
            }
        } catch (\Throwable $e) {}

        return AttendanceRecord::create([
            'employee_id' => $employee->id,
            'attendance_date' => $date,
            'clock_in_at' => $now,
            'clock_in_latitude' => $data['latitude'],
            'clock_in_longitude' => $data['longitude'],
            'clock_in_accuracy' => $data['accuracy'] ?? null,
            'selfie_path' => $selfiePath,
            'status' => 'open',
            'is_late' => $now->greaterThan($shiftStart),
            'correction_reason' => $geofenceAlert,
        ]);
    }

    public function clockOut(Employee $employee, array $data): AttendanceRecord
    {
        $this->requireSelfClocking($employee);

        $record = null;
        if (! empty($data['record_id'])) {
            $record = AttendanceRecord::where('employee_id', $employee->id)
                ->where('id', $data['record_id'])
                ->whereNull('clock_out_at')
                ->first();
        } elseif (! empty($data['attendance_date'])) {
            $record = AttendanceRecord::where('employee_id', $employee->id)
                ->whereDate('attendance_date', $data['attendance_date'])
                ->whereNull('clock_out_at')
                ->first();
        } else {
            // First look for today's record
            $record = AttendanceRecord::where('employee_id', $employee->id)
                ->whereDate('attendance_date', now()->toDateString())
                ->whereNull('clock_out_at')
                ->first();

            // If not found, look for an unclosed previous record (forgot logout yesterday)
            if (! $record) {
                $record = AttendanceRecord::where('employee_id', $employee->id)
                    ->whereDate('attendance_date', '<', now()->toDateString())
                    ->whereNull('clock_out_at')
                    ->where('status', '!=', 'absent')
                    ->latest('attendance_date')
                    ->first();
            }
        }

        if (! $record) {
            throw ValidationException::withMessages(['attendance' => 'No open attendance record found to Time Out.']);
        }
        if ($record->clock_out_at) {
            throw ValidationException::withMessages(['attendance' => 'You have already completed Time Out for this record.']);
        }

        // Close any active breaks on that record
        $record->breaks()->whereNull('ended_at')->each(function ($break) use ($record) {
            $endTime = Carbon::parse($record->attendance_date->toDateString().' 14:00:00');
            $start = $break->started_at ?: $endTime->copy()->subMinutes(30);
            $duration = max(15, (int) round($start->diffInMinutes($endTime)));
            $break->update(['ended_at' => $endTime, 'duration_minutes' => $duration]);
        });

        $now = now();
        $isPreviousDay = $record->attendance_date->isBefore($now->startOfDay());

        if ($isPreviousDay) {
            // Employee forgot to logout yesterday; set clock_out_at to yesterday's scheduled shift end
            $shiftEndStr = substr((string) ($employee->shift_end ?: '18:00:00'), 0, 8);
            $clockOutTime = Carbon::parse($record->attendance_date->toDateString().' '.$shiftEndStr);
            if ($clockOutTime->lessThanOrEqualTo($record->clock_in_at)) {
                $clockOutTime = $record->clock_in_at->copy()->addHours(8);
            }
        } else {
            $elapsedMinutes = (int) floor($record->clock_in_at->diffInMinutes($now));
            if ($elapsedMinutes < 30) {
                throw ValidationException::withMessages(['attendance' => 'ટાઈમ-ઇન કર્યાના ઓછામાં ઓછા ૩૦ મિનિટ પછી જ ટાઈમ-આઉટ કરી શકાય છે.']);
            }
            $clockOutTime = $now;
        }

        $record->fill([
            'clock_out_at' => $clockOutTime,
            'clock_out_latitude' => $data['latitude'] ?? null,
            'clock_out_longitude' => $data['longitude'] ?? null,
            'clock_out_accuracy' => $data['accuracy'] ?? null,
            'work_done' => $data['work_done'],
            'learned' => $data['learned'],
        ]);
        $this->calculate($record, $employee);
        $record->save();

        return $record->fresh('breaks');
    }

    public function startBreak(Employee $employee, array $data = [], ?UploadedFile $selfie = null): AttendanceBreak
    {
        $this->requireSelfClocking($employee);
        $record = AttendanceRecord::where('employee_id', $employee->id)
            ->whereDate('attendance_date', now()->toDateString())->whereNull('clock_out_at')->first();
        if (! $record) {
            throw ValidationException::withMessages(['attendance' => 'Use Time In before starting a break.']);
        }
        if ($record->breaks()->whereNull('ended_at')->exists()) {
            throw ValidationException::withMessages(['attendance' => 'A break or urgent out is already active.']);
        }

        $type = $data['break_type'] ?? 'regular';
        $reason = $data['out_reason'] ?? null;
        $outSelfiePath = null;
        if ($type === 'urgent_out') {
            if (! $selfie) {
                throw ValidationException::withMessages(['selfie' => 'અર્જન્ટ બહાર જવા માટે લાઈવ સેલ્ફી જરૂરી છે.']);
            }
            if (empty($reason)) {
                throw ValidationException::withMessages(['out_reason' => 'અર્જન્ટ બહાર જવાનું કારણ લખવું જરૂરી છે.']);
            }
            $outSelfiePath = $selfie->store('attendance-break-selfies/'.now()->format('Y/m'));
        }

        $this->ensureBreakColumnsExist();

        return $record->breaks()->create([
            'break_type' => $type,
            'out_reason' => $reason,
            'out_selfie_path' => $outSelfiePath,
            'started_at' => now(),
        ]);
    }

    private function ensureBreakColumnsExist(): void
    {
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('attendance_breaks') && ! \Illuminate\Support\Facades\Schema::hasColumn('attendance_breaks', 'break_type')) {
                \Illuminate\Support\Facades\Schema::table('attendance_breaks', function (\Illuminate\Database\Schema\Blueprint $table) {
                    if (! \Illuminate\Support\Facades\Schema::hasColumn('attendance_breaks', 'break_type')) {
                        $table->string('break_type')->default('regular');
                    }
                    if (! \Illuminate\Support\Facades\Schema::hasColumn('attendance_breaks', 'out_reason')) {
                        $table->string('out_reason')->nullable();
                    }
                    if (! \Illuminate\Support\Facades\Schema::hasColumn('attendance_breaks', 'out_selfie_path')) {
                        $table->string('out_selfie_path')->nullable();
                    }
                    if (! \Illuminate\Support\Facades\Schema::hasColumn('attendance_breaks', 'deduction_amount')) {
                        $table->decimal('deduction_amount', 10, 2)->default(0.00);
                    }
                    if (! \Illuminate\Support\Facades\Schema::hasColumn('attendance_breaks', 'is_deducted')) {
                        $table->boolean('is_deducted')->default(false);
                    }
                    if (! \Illuminate\Support\Facades\Schema::hasColumn('attendance_breaks', 'admin_waived')) {
                        $table->boolean('admin_waived')->default(false);
                    }
                    if (! \Illuminate\Support\Facades\Schema::hasColumn('attendance_breaks', 'waive_reason')) {
                        $table->string('waive_reason')->nullable();
                    }
                });
            }
        } catch (\Throwable $e) {
            // Ignore
        }
    }

    public function endBreak(Employee $employee, UploadedFile $selfie): AttendanceBreak
    {
        $this->ensureBreakColumnsExist();
        $this->requireSelfClocking($employee);
        $record = AttendanceRecord::where('employee_id', $employee->id)
            ->whereDate('attendance_date', now()->toDateString())->whereNull('clock_out_at')->first();
        $break = $record?->breaks()->whereNull('ended_at')->latest('started_at')->first();
        if (! $break) {
            throw ValidationException::withMessages(['attendance' => 'There is no active break to end.']);
        }

        $selfiePath = $selfie->store('attendance-break-selfies/'.now()->format('Y/m'));
        $durationMinutes = (int) floor($break->started_at->diffInMinutes(now()));

        // Calculate prorated deduction for urgent_out based on employee's salary rate
        $deductionAmount = 0.00;
        if ($break->break_type === 'urgent_out' && $durationMinutes > 0) {
            $latestRate = $employee->salaryRates()->orderByDesc('effective_month')->first();
            $monthlySalary = (float) ($latestRate?->monthly_salary ?? 0);
            if ($monthlySalary > 0) {
                // Approximate hourly rate = monthlySalary / (26 working days * 8 hours)
                $perMinuteRate = $monthlySalary / (26 * 8 * 60);
                $deductionAmount = round($perMinuteRate * $durationMinutes, 2);
            }
        }

        $break->update([
            'ended_at' => now(),
            'return_selfie_path' => $selfiePath,
            'duration_minutes' => $durationMinutes,
            'deduction_amount' => $deductionAmount,
            'is_deducted' => $deductionAmount > 0,
        ]);
        $record->update(['break_minutes' => (int) $record->breaks()->sum('duration_minutes')]);

        return $break->fresh();
    }

    public function recordManual(Employee $employee, array $data, User $actor): AttendanceRecord
    {
        return DB::transaction(function () use ($employee, $data, $actor) {
            $employee = Employee::with('user')->whereKey($employee->id)->lockForUpdate()->firstOrFail();
            if (! $employee->active || ! $employee->user?->active) {
                throw ValidationException::withMessages(['employee_id' => 'Only active employees can receive attendance.']);
            }
            if (! $employee->manager_attendance_only) {
                throw ValidationException::withMessages(['employee_id' => 'Enable “Manager records attendance” for this employee first.']);
            }

            $date = Carbon::createFromFormat('Y-m-d', $data['attendance_date'])->startOfDay();
            if ($date->isFuture()) {
                throw ValidationException::withMessages(['attendance_date' => 'Future attendance dates are not allowed.']);
            }
            if ($employee->joining_date && $date->lt($employee->joining_date->copy()->startOfDay())) {
                throw ValidationException::withMessages(['attendance_date' => 'Attendance cannot be earlier than the employee’s joining date.']);
            }

            $clockIn = Carbon::createFromFormat('Y-m-d\TH:i', $data['clock_in_at']);
            $clockOut = Carbon::createFromFormat('Y-m-d\TH:i', $data['clock_out_at']);
            if ($clockIn->toDateString() !== $date->toDateString() || $clockOut->toDateString() !== $date->toDateString()) {
                throw ValidationException::withMessages(['clock_out_at' => 'Time In and Time Out must be on the attendance date.']);
            }
            if ($clockOut->lessThanOrEqualTo($clockIn)) {
                throw ValidationException::withMessages(['clock_out_at' => 'Time Out must be after Time In.']);
            }
            if ($clockIn->isFuture() || $clockOut->isFuture()) {
                throw ValidationException::withMessages(['clock_out_at' => 'Future attendance times are not allowed.']);
            }

            $durationMinutes = (int) floor($clockIn->diffInMinutes($clockOut));
            $breakMinutes = (int) $data['break_minutes'];
            if ($breakMinutes >= $durationMinutes) {
                throw ValidationException::withMessages(['break_minutes' => 'Break minutes must be shorter than the attendance duration.']);
            }

            $context = $this->dayContext($employee, $date);
            if ($context['holiday']?->type === 'full_day') {
                throw ValidationException::withMessages(['attendance_date' => "{$context['holiday']->name} is a full-day holiday."]);
            }
            if ($context['weeklyOff']) {
                throw ValidationException::withMessages(['attendance_date' => 'The selected date is the employee’s weekly off.']);
            }
            if ($context['leave']?->day_part === 'full_day') {
                throw ValidationException::withMessages(['attendance_date' => 'The employee has approved full-day leave on this date.']);
            }

            if (AttendanceRecord::where('employee_id', $employee->id)->whereDate('attendance_date', $date)->lockForUpdate()->exists()) {
                throw ValidationException::withMessages(['attendance_date' => 'Attendance already exists for this employee and date.']);
            }

            $shiftStart = Carbon::parse($date->toDateString().' '.$employee->shift_start)->addMinutes($employee->grace_minutes);
            if ($context['holiday']?->type === 'first_half' || $context['leave']?->day_part === 'first_half') {
                $shiftStart->addMinutes($employee->half_day_minutes);
            }

            $record = new AttendanceRecord([
                'employee_id' => $employee->id,
                'attendance_date' => $date,
                'clock_in_at' => $clockIn,
                'clock_in_latitude' => null,
                'clock_in_longitude' => null,
                'clock_in_accuracy' => null,
                'selfie_path' => null,
                'entry_source' => 'manager',
                'recorded_by' => $actor->id,
                'entry_reason' => $data['entry_reason'],
                'clock_out_at' => $clockOut,
                'clock_out_latitude' => null,
                'clock_out_longitude' => null,
                'clock_out_accuracy' => null,
                'work_done' => $data['work_done'],
                'learned' => $data['learned'],
                'is_late' => $clockIn->greaterThan($shiftStart),
            ]);
            $this->calculate($record, $employee, $breakMinutes);
            $record->save();

            $this->activity->log(
                $actor,
                null,
                'created',
                'manager_attendance',
                $record->id,
                "Manager attendance recorded for {$employee->employee_code} on {$date->toDateString()}",
                ['employee_id' => $employee->id, 'attendance_date' => $date->toDateString(), 'entry_reason' => $data['entry_reason']]
            );

            return $record->fresh(['employee.user:id,name,email', 'recordedBy:id,name', 'breaks']);
        });
    }

    public function quickMark(Employee $employee, array $data, User $actor): AttendanceRecord
    {
        return DB::transaction(function () use ($employee, $data, $actor) {
            $employee = Employee::with('user')->whereKey($employee->id)->lockForUpdate()->firstOrFail();
            if (! $employee->active || ! $employee->user?->active) {
                throw ValidationException::withMessages(['employee_id' => 'Only active employees can receive attendance.']);
            }

            $date = Carbon::createFromFormat('Y-m-d', $data['attendance_date'])->startOfDay();
            if ($date->isFuture()) {
                throw ValidationException::withMessages(['attendance_date' => 'Future attendance dates are not allowed.']);
            }

            $rawDayType = $data['day_type'] ?? 'full_day';
            $dayType = in_array($rawDayType, ['full_day', 'half_day', 'absent'], true) ? $rawDayType : 'full_day';
            $shiftStartStr = substr((string) ($employee->shift_start ?: '09:00:00'), 0, 5);
            $shiftEndStr = $dayType === 'half_day'
                ? '13:30'
                : substr((string) ($employee->shift_end ?: '18:00:00'), 0, 5);

            $clockIn = Carbon::parse($date->toDateString() . ' ' . $shiftStartStr);
            $clockOut = Carbon::parse($date->toDateString() . ' ' . $shiftEndStr);
            if ($clockOut->lessThanOrEqualTo($clockIn)) {
                $clockOut = $clockIn->copy()->addMinutes($dayType === 'half_day' ? 270 : 540);
            }

            if ($dayType === 'absent') {
                $breakMinutes = 0;
                $workMinutes = 0;
                $status = 'absent';
                $clockOut = null;
                $reason = trim((string) ($data['entry_reason'] ?? '')) ?: 'Quick Checklist: Marked Absent by Superadmin (પ્લાન્ટ પર ગેરહાજર)';
                $workDone = 'Marked Absent by Superadmin (પ્લાન્ટ પર ગેરહાજર)';
            } elseif ($dayType === 'half_day') {
                $breakMinutes = 0;
                $workMinutes = $employee->half_day_minutes ?: 240;
                $status = 'half_day';
                $reason = trim((string) ($data['entry_reason'] ?? '')) ?: 'Quick Checklist: Half Day (અડધો દિવસ)';
                $workDone = 'Half Day Solar Plant Duty';
            } else {
                $breakMinutes = 60;
                $workMinutes = $employee->working_minutes ?: 480;
                $status = 'present';
                $reason = trim((string) ($data['entry_reason'] ?? '')) ?: 'Quick Checklist: Full Day (આખો દિવસ)';
                $workDone = 'Full Day Solar Plant Duty';
            }

            $existing = AttendanceRecord::where('employee_id', $employee->id)
                ->whereDate('attendance_date', $date)
                ->lockForUpdate()
                ->first();

            if ($existing) {
                $existing->fill([
                    'clock_in_at' => $existing->clock_in_at ?: $clockIn,
                    'clock_out_at' => $dayType === 'absent' ? null : $clockOut,
                    'entry_source' => $existing->entry_source ?: 'manager',
                    'recorded_by' => $actor->id,
                    'entry_reason' => $reason,
                    'work_done' => $dayType === 'absent' ? $workDone : ($existing->work_done ?: $workDone),
                    'learned' => $dayType === 'absent' ? '' : ($existing->learned ?: 'Completed plant inspection and operations'),
                    'work_minutes' => $workMinutes,
                    'break_minutes' => $breakMinutes,
                    'status' => $status,
                    'is_late' => false,
                    'is_early_out' => false,
                    'manual_correction' => true,
                    'correction_reason' => $reason,
                    'corrected_by' => $actor->id,
                    'corrected_at' => now(),
                ]);
                $existing->save();
                $record = $existing;
            } else {
                $record = AttendanceRecord::create([
                    'employee_id' => $employee->id,
                    'attendance_date' => $date,
                    'clock_in_at' => $clockIn,
                    'clock_in_latitude' => null,
                    'clock_in_longitude' => null,
                    'clock_in_accuracy' => null,
                    'selfie_path' => null,
                    'entry_source' => 'manager',
                    'recorded_by' => $actor->id,
                    'entry_reason' => $reason,
                    'clock_out_at' => $dayType === 'absent' ? null : $clockOut,
                    'clock_out_latitude' => null,
                    'clock_out_longitude' => null,
                    'clock_out_accuracy' => null,
                    'work_done' => $workDone,
                    'learned' => $dayType === 'absent' ? '' : 'Completed plant inspection and operations',
                    'is_late' => false,
                    'work_minutes' => $workMinutes,
                    'break_minutes' => $breakMinutes,
                    'status' => $status,
                    'is_early_out' => false,
                    'overtime_minutes' => 0,
                    'manual_correction' => true,
                    'correction_reason' => $reason,
                    'corrected_by' => $actor->id,
                    'corrected_at' => now(),
                ]);
            }

            try {
                if ($employee->user) {
                    app(\App\Services\SmartVoiceCallAlertService::class)->dismissCallForUser($employee->user);
                }
            } catch (\Throwable $e) {}

            $this->activity->log(
                $actor,
                null,
                'created',
                'manager_attendance',
                $record->id,
                "Quick checklist attendance ({$dayType}) recorded for {$employee->employee_code} on {$date->toDateString()}",
                ['employee_id' => $employee->id, 'attendance_date' => $date->toDateString(), 'day_type' => $dayType]
            );

            return $record->fresh(['employee.user:id,name,email', 'recordedBy:id,name', 'breaks']);
        });
    }

    public function correct(AttendanceRecord $record, array $data, User $actor): AttendanceRecord
    {
        $clockOut = Carbon::parse($data['clock_out_at']);
        if ($clockOut->lessThanOrEqualTo($record->clock_in_at)) {
            throw ValidationException::withMessages(['clock_out_at' => 'Time Out must be after Time In.']);
        }
        if ($clockOut->toDateString() !== $record->attendance_date->toDateString()) {
            throw ValidationException::withMessages(['clock_out_at' => 'Time out must be on the attendance date.']);
        }
        if ($record->entry_source === 'manager' && $record->break_minutes >= (int) floor($record->clock_in_at->diffInMinutes($clockOut))) {
            throw ValidationException::withMessages(['clock_out_at' => 'Time Out must leave more working time than the recorded break.']);
        }

        $old = $record->only(['clock_out_at', 'clock_out_latitude', 'clock_out_longitude', 'clock_out_accuracy', 'work_done', 'learned', 'status', 'work_minutes']);
        $record->fill([
            'clock_out_at' => $clockOut,
            'clock_out_latitude' => $data['clock_out_latitude'] ?? $record->clock_out_latitude,
            'clock_out_longitude' => $data['clock_out_longitude'] ?? $record->clock_out_longitude,
            'clock_out_accuracy' => $data['clock_out_accuracy'] ?? $record->clock_out_accuracy,
            'work_done' => $data['work_done'],
            'learned' => $data['learned'],
            'manual_correction' => true,
            'correction_reason' => $data['correction_reason'],
            'corrected_by' => $actor->id,
            'corrected_at' => now(),
        ]);
        $this->calculate($record, $record->employee, $record->entry_source === 'manager' ? $record->break_minutes : null);
        $record->save();
        AttendanceAdjustment::create([
            'attendance_record_id' => $record->id,
            'user_id' => $actor->id,
            'old_values' => $old,
            'new_values' => $record->only(['clock_out_at', 'clock_out_latitude', 'clock_out_longitude', 'clock_out_accuracy', 'work_done', 'learned', 'status', 'work_minutes']),
            'reason' => $data['correction_reason'],
            'created_at' => now(),
        ]);

        return $record->fresh(['employee.user:id,name', 'correctedBy:id,name']);
    }

    public function today(Employee $employee): array
    {
        $today = now()->startOfDay();
        $todayDate = $today->toDateString();
        $currentTime = now()->format('H:i:s');
        $context = $this->dayContext($employee, $today);
        $record = AttendanceRecord::with('breaks')->where('employee_id', $employee->id)->whereDate('attendance_date', $today)->first();

        // Check if employee has an unclosed attendance from a previous day (forgot logout yesterday)
        $unclosedPreviousRecord = AttendanceRecord::with('breaks')
            ->where('employee_id', $employee->id)
            ->whereDate('attendance_date', '<', $todayDate)
            ->whereNull('clock_out_at')
            ->where('status', '!=', 'absent')
            ->latest('attendance_date')
            ->first();

        $hasUnclosedPreviousDay = (bool) $unclosedPreviousRecord;

        // Check if employee has an approved half-day leave for today
        $hasApprovedHalfDay = LeaveRequest::where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->whereDate('date_from', '<=', $todayDate)
            ->whereDate('date_to', '>=', $todayDate)
            ->whereIn('day_part', ['first_half', 'second_half'])
            ->exists();

        $earliestTime = $hasApprovedHalfDay ? '13:00:00' : '18:00:00';
        $humanTime = $hasApprovedHalfDay ? '01:00 PM' : '06:00 PM';
        $isTimeReached = ($currentTime >= $earliestTime);

        $hasWorkedMin = $record && $record->clock_in_at ? (int) floor($record->clock_in_at->diffInMinutes(now())) >= 30 : false;

        return [
            'date' => $today->toDateString(),
            'employee' => $employee->loadMissing('user:id,name,email'),
            'record' => $record,
            'unclosed_previous_record' => $unclosedPreviousRecord,
            'has_unclosed_previous_day' => $hasUnclosedPreviousDay,
            'holiday' => $context['holiday'],
            'leave' => $context['leave'],
            'weekly_off' => $context['weeklyOff'],
            'manager_attendance_only' => $employee->manager_attendance_only,
            'has_approved_half_day' => $hasApprovedHalfDay,
            'earliest_clock_out_time' => $earliestTime,
            'earliest_clock_out_human' => $humanTime,
            'is_clock_out_time_reached' => $isTimeReached,
            'can_clock_in' => ! $employee->manager_attendance_only && ! $hasUnclosedPreviousDay && ! $record && ! $context['weeklyOff'] && $context['holiday']?->type !== 'full_day' && $context['leave']?->day_part !== 'full_day',
            'can_clock_out' => ! $employee->manager_attendance_only && (bool) ($record && ! $record->clock_out_at && $record->status !== 'absent' && $hasWorkedMin),
            'is_clocked_in_waiting' => ! $employee->manager_attendance_only && (bool) ($record && ! $record->clock_out_at && $record->status !== 'absent' && ! $hasWorkedMin),
        ];
    }

    private function calculate(AttendanceRecord $record, Employee $employee, ?int $manualBreakMinutes = null): void
    {
        $breakMinutes = $manualBreakMinutes === null
            ? (int) $record->breaks()->whereNotNull('ended_at')->sum('duration_minutes')
            : $manualBreakMinutes;
        $minutes = max(0, (int) floor($record->clock_in_at->diffInMinutes($record->clock_out_at)) - $breakMinutes);
        $context = $this->dayContext($employee, $record->attendance_date->copy());
        $halfEntitlement = $context['holiday'] && $context['holiday']->type !== 'full_day'
            || $context['leave'] && $context['leave']->day_part !== 'full_day';
        $requiredMinutes = $halfEntitlement ? $employee->half_day_minutes : $employee->working_minutes;
        
        // Grace period: allow 30 minutes grace + up to 60 minutes regular lunch/tea break allowance on a full day
        $breakAllowance = $halfEntitlement ? 0 : min(60, $breakMinutes);
        $presentThreshold = max(240, $requiredMinutes - 30 - $breakAllowance);
        $halfDayThreshold = max(180, (int) round($employee->half_day_minutes * 0.85));

        $shiftEnd = Carbon::parse($record->attendance_date->toDateString().' '.$employee->shift_end);
        $record->work_minutes = $minutes;
        $record->break_minutes = $breakMinutes;
        $record->status = $minutes >= $presentThreshold ? 'present' : ($minutes >= $halfDayThreshold ? 'half_day' : 'short_day');
        $record->is_early_out = $record->clock_out_at->lessThan($shiftEnd) && $minutes < $presentThreshold;
        $record->overtime_minutes = max(0, $minutes - $requiredMinutes);
    }

    private function requireSelfClocking(Employee $employee): void
    {
        if ($employee->manager_attendance_only) {
            throw ValidationException::withMessages([
                'attendance' => 'Your attendance is recorded by an authorized manager.',
            ]);
        }
    }
}
