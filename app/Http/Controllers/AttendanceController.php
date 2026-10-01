<?php

namespace App\Http\Controllers;

use App\Http\Requests\ClockInRequest;
use App\Http\Requests\ClockOutRequest;
use App\Http\Requests\CorrectAttendanceRequest;
use App\Http\Requests\EndBreakRequest;
use App\Http\Requests\SaveManualAttendanceRequest;
use App\Models\AttendanceBreak;
use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Services\AttendanceService;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AttendanceController extends Controller
{
    public function __construct(private readonly SolarAccessService $access, private readonly AttendanceService $attendance) {}

    public function today(Request $request): array
    {
        return $this->attendance->today($this->attendance->employeeFor($request->user()));
    }

    public function mine(Request $request)
    {
        $employee = $this->attendance->employeeFor($request->user());

        return AttendanceRecord::with(['breaks', 'recordedBy:id,name'])->where('employee_id', $employee->id)->latest('attendance_date')->limit(45)->get();
    }

    public function clockIn(ClockInRequest $request)
    {
        $employee = $this->attendance->employeeFor($request->user());

        return $this->attendance->clockIn($employee, $request->validated(), $request->file('selfie'));
    }

    public function clockOut(ClockOutRequest $request)
    {
        $employee = $this->attendance->employeeFor($request->user());

        return $this->attendance->clockOut($employee, $request->validated());
    }

    public function startBreak(Request $request)
    {
        return $this->attendance->startBreak($this->attendance->employeeFor($request->user()));
    }

    public function endBreak(EndBreakRequest $request)
    {
        return $this->attendance->endBreak($this->attendance->employeeFor($request->user()), $request->file('selfie'));
    }

    public function manual(SaveManualAttendanceRequest $request)
    {
        $this->access->requirePermission($request, 'record_employee_attendance');
        $data = $request->validated();

        return response()->json(
            $this->attendance->recordManual(Employee::findOrFail($data['employee_id']), $data, $request->user()),
            201
        );
    }

    public function index(Request $request)
    {
        $this->access->requirePermission($request, 'view_attendance');
        $query = AttendanceRecord::with(['employee.user:id,name,email', 'correctedBy:id,name', 'recordedBy:id,name', 'breaks'])->latest('attendance_date')->latest('clock_in_at');
        if ($request->filled('date')) {
            $query->whereDate('attendance_date', $request->input('date'));
        }
        if ($request->filled('date_from')) {
            $query->whereDate('attendance_date', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('attendance_date', '<=', $request->input('date_to'));
        }
        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->integer('employee_id'));
        }
        if ($request->boolean('open_only')) {
            $query->whereNull('clock_out_at');
        }

        return $query->limit(500)->get()->each(fn (AttendanceRecord $record) => $record->setAttribute(
            'selfie_url',
            $record->selfie_path ? '/api/attendance/'.$record->id.'/selfie' : null
        ));
    }

    public function correct(CorrectAttendanceRequest $request, AttendanceRecord $attendanceRecord)
    {
        $this->access->requireAttendanceCorrection($request);

        return $this->attendance->correct($attendanceRecord->load('employee'), $request->validated(), $request->user());
    }

    public function selfie(Request $request, AttendanceRecord $attendanceRecord)
    {
        $own = $request->user()->role === 'employee' && $request->user()->employee?->id === $attendanceRecord->employee_id;
        abort_unless($own || $request->user()->hasPermission('view_attendance'), 403);
        abort_unless($attendanceRecord->selfie_path && Storage::exists($attendanceRecord->selfie_path), 404);

        return Storage::response($attendanceRecord->selfie_path);
    }

    public function breakSelfie(Request $request, AttendanceBreak $attendanceBreak)
    {
        $attendanceBreak->loadMissing('attendanceRecord');
        $own = $request->user()->role === 'employee' && $request->user()->employee?->id === $attendanceBreak->attendanceRecord->employee_id;
        abort_unless($own || $request->user()->hasPermission('view_attendance'), 403);
        abort_unless($attendanceBreak->return_selfie_path && Storage::exists($attendanceBreak->return_selfie_path), 404);

        return Storage::response($attendanceBreak->return_selfie_path);
    }
}
