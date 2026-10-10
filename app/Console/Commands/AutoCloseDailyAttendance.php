<?php

namespace App\Console\Commands;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Console\Command;

class AutoCloseDailyAttendance extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'attendance:auto-close-daily';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Automatically closes unclosed attendance records at the end of the day';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $todayStr = Carbon::today()->toDateString();
        $openRecords = AttendanceRecord::with('employee')
            ->whereDate('attendance_date', $todayStr)
            ->whereNull('clock_out_at')
            ->get();

        if ($openRecords->isEmpty()) {
            $this->info('No open attendance records found for today.');
            return;
        }

        foreach ($openRecords as $record) {
            $emp = $record->employee;
            if (! $emp) {
                continue;
            }

            // Close active breaks first
            $record->breaks()->whereNull('ended_at')->update([
                'ended_at' => Carbon::now(),
                'duration_minutes' => 30,
            ]);

            // Default auto clock out time at shift end
            $shiftEndStr = $emp->shift_end ?: '18:00:00';
            $autoOutTime = Carbon::parse($todayStr . ' ' . $shiftEndStr);
            if ($autoOutTime->lessThanOrEqualTo($record->clock_in_at)) {
                $autoOutTime = Carbon::now();
            }

            $breakMinutes = (int) $record->breaks()->sum('duration_minutes');
            $workMinutes = max(0, (int) floor($record->clock_in_at->diffInMinutes($autoOutTime)) - $breakMinutes);
            $requiredMinutes = $emp->working_minutes ?: 480;
            $presentThreshold = max(240, $requiredMinutes - 30);
            $halfDayThreshold = max(180, (int) round(($emp->half_day_minutes ?: 240) * 0.85));

            $status = $workMinutes >= $presentThreshold ? 'present' : ($workMinutes >= $halfDayThreshold ? 'half_day' : 'short_day');

            $record->update([
                'clock_out_at' => $autoOutTime,
                'work_minutes' => $workMinutes,
                'break_minutes' => $breakMinutes,
                'work_done' => $record->work_done ?: 'ઓટો સિસ્ટમ ક્લોઝ (કર્મચારી ટાઈમ આઉટ કરવાનું ભૂલી ગયેલ)',
                'learned' => $record->learned ?: 'ઓટો સિસ્ટમ ક્લોઝ',
                'status' => $status,
                'manual_correction' => true,
                'correction_reason' => 'Daily end auto-close',
            ]);

            $this->info("Auto-closed attendance for Employee ID: {$emp->id} ({$emp->employee_code})");
        }
    }
}
