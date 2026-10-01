<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReviewLeaveRequest;
use App\Http\Requests\SaveLeaveRequest;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Services\AttendanceService;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class LeaveController extends Controller
{
    public function __construct(private readonly SolarAccessService $access, private readonly AttendanceService $attendance) {}

    public function types(Request $request)
    {
        abort_unless($request->user()->role === 'employee' || $request->user()->hasPermission('view_attendance'), 403);

        return LeaveType::where('active', true)->orderBy('name')->get();
    }

    public function mine(Request $request)
    {
        $employee = $this->attendance->employeeFor($request->user());

        return LeaveRequest::with(['leaveType:id,name,paid', 'reviewer:id,name'])->where('employee_id', $employee->id)->latest()->get();
    }

    public function store(SaveLeaveRequest $request)
    {
        $employee = $this->attendance->employeeFor($request->user());
        $data = $request->validated();
        $data['leave_type_id'] = LeaveType::firstOrCreate(
            ['name' => 'General Leave'],
            ['paid' => true, 'active' => true],
        )->id;
        $overlap = LeaveRequest::where('employee_id', $employee->id)->whereIn('status', ['pending', 'approved'])
            ->whereDate('date_from', '<=', $data['date_to'])->whereDate('date_to', '>=', $data['date_from'])->exists();
        if ($overlap) {
            throw ValidationException::withMessages(['date_from' => 'A pending or approved leave already covers these dates.']);
        }
        $data['employee_id'] = $employee->id;
        if ($request->hasFile('attachment')) {
            $data['attachment_path'] = $request->file('attachment')->store('leave-attachments');
        }

        return LeaveRequest::create($data)->load('leaveType:id,name,paid');
    }

    public function index(Request $request)
    {
        $this->access->requirePermission($request, 'view_attendance');
        $query = LeaveRequest::with(['employee.user:id,name,email', 'leaveType:id,name,paid', 'reviewer:id,name'])->latest();
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        return $query->limit(500)->get();
    }

    public function review(ReviewLeaveRequest $request, LeaveRequest $leaveRequest)
    {
        $this->access->requirePermission($request, 'approve_leaves');
        abort_if($leaveRequest->employee->user_id === $request->user()->id, 422, 'You cannot approve your own leave.');
        abort_unless($leaveRequest->status === 'pending', 422, 'Only pending leave can be reviewed.');
        $leaveRequest->update([
            'status' => $request->validated('status'), 'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(), 'review_remarks' => $request->validated('remarks'),
        ]);

        return $leaveRequest->fresh(['employee.user:id,name', 'leaveType:id,name,paid', 'reviewer:id,name']);
    }
}
