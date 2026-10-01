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
        ]);
    }

    public function clockOut(Employee $employee, array $data): AttendanceRecord
    {
        $this->requireSelfClocking($employee);
        $record = AttendanceRecord::where('employee_id', $employee->id)
            ->whereDate('attendance_date', now()->toDateString())->first();
        if (! $record) {
            throw ValidationException::withMessages(['attendance' => 'Use Time In before Time Out.']);
        }
        if ($record->clock_out_at) {
            throw ValidationException::withMessages(['attendance' => 'You have already completed Time Out today.']);
        }
        if ($record->breaks()->whereNull('ended_at')->exists()) {
            throw ValidationException::withMessages(['attendance' => 'End your active break before Time Out.']);
        }

        $record->fill([
            'clock_out_at' => now(),
            'clock_out_latitude' => $data['latitude'],
            'clock_out_longitude' => $data['longitude'],
            'clock_out_accuracy' => $data['accuracy'] ?? null,
            'work_done' => $data['work_done'],
            'learned' => $data['learned'],
        ]);
        $this->calculate($record, $employee);
        $record->save();

        return $record->fresh('breaks');
    }

    public function startBreak(Employee $employee): AttendanceBreak
    {
        $this->requireSelfClocking($employee);
        $record = AttendanceRecord::where('employee_id', $employee->id)
            ->whereDate('attendance_date', now()->toDateString())->whereNull('clock_out_at')->first();
        if (! $record) {
            throw ValidationException::withMessages(['attendance' => 'Use Time In before starting a break.']);
        }
        if ($record->breaks()->whereNull('ended_at')->exists()) {
            throw ValidationException::withMessages(['attendance' => 'A break is already active.']);
        }

        return $record->breaks()->create(['started_at' => now()]);
    }

    public function endBreak(Employee $employee, UploadedFile $selfie): AttendanceBreak
    {
        $this->requireSelfClocking($employee);
        $record = AttendanceRecord::where('employee_id', $employee->id)
            ->whereDate('attendance_date', now()->toDateString())->whereNull('clock_out_at')->first();
        $break = $record?->breaks()->whereNull('ended_at')->latest('started_at')->first();
        if (! $break) {
            throw ValidationException::withMessages(['attendance' => 'There is no active break to end.']);
        }

        $selfiePath = $selfie->store('attendance-break-selfies/'.now()->format('Y/m'));
        $break->update([
            'ended_at' => now(),
            'return_selfie_path' => $selfiePath,
            'duration_minutes' => (int) floor($break->started_at->diffInMinutes(now())),
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
        $context = $this->dayContext($employee, $today);
        $record = AttendanceRecord::with('breaks')->where('employee_id', $employee->id)->whereDate('attendance_date', $today)->first();

        return [
            'date' => $today->toDateString(),
            'employee' => $employee->loadMissing('user:id,name,email'),
            'record' => $record,
            'holiday' => $context['holiday'],
            'leave' => $context['leave'],
            'weekly_off' => $context['weeklyOff'],
            'manager_attendance_only' => $employee->manager_attendance_only,
            'can_clock_in' => ! $employee->manager_attendance_only && ! $record && ! $context['weeklyOff'] && $context['holiday']?->type !== 'full_day' && $context['leave']?->day_part !== 'full_day',
            'can_clock_out' => ! $employee->manager_attendance_only && (bool) ($record && ! $record->clock_out_at),
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
        $shiftEnd = Carbon::parse($record->attendance_date->toDateString().' '.$employee->shift_end);
        $record->work_minutes = $minutes;
        $record->break_minutes = $breakMinutes;
        $record->status = $minutes >= $requiredMinutes ? 'present' : ($minutes >= $employee->half_day_minutes ? 'half_day' : 'short_day');
        $record->is_early_out = $record->clock_out_at->lessThan($shiftEnd) && $minutes < $requiredMinutes;
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
