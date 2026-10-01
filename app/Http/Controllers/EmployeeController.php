<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveEmployeeRequest;
use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class EmployeeController extends Controller
{
    public function __construct(private readonly SolarAccessService $access, private readonly ActivityLogger $activity) {}

    public function index(Request $request)
    {
        $this->access->requirePermission($request, 'view_employees');

        return Employee::with('user:id,name,email,active')->orderBy('employee_code')->get()->map(fn (Employee $employee) => [
            ...$employee->toArray(),
            'name' => $employee->user->name,
            'email' => $employee->user->email,
            'profile_photo_url' => $employee->profile_photo_path ? '/api/employees/'.$employee->id.'/photo?v='.$employee->updated_at?->timestamp : null,
        ]);
    }

    public function store(SaveEmployeeRequest $request)
    {
        $this->access->requireEmployeeManagement($request);
        $data = $request->validated();

        $employee = DB::transaction(function () use ($request, $data) {
            $employee = ! empty($data['id']) ? Employee::with('user')->findOrFail($data['id']) : null;
            if ($employee && ! $employee->manager_attendance_only && ! empty($data['manager_attendance_only'])
                && AttendanceRecord::where('employee_id', $employee->id)->whereNull('clock_out_at')->exists()) {
                throw ValidationException::withMessages([
                    'manager_attendance_only' => 'Complete the employee’s open attendance before enabling manager-recorded attendance.',
                ]);
            }
            $userData = [
                'name' => $data['name'], 'email' => $data['email'], 'role' => 'employee', 'company_id' => null,
                'permissions' => ['clock_attendance', 'enter_readings', 'view_stock', 'manage_stock', 'issue_stock', 'return_stock'],
                'active' => (bool) $data['active'],
            ];
            if (! empty($data['password'])) {
                $userData['password'] = Hash::make($data['password']);
            }
            $user = $employee?->user;
            if ($user) {
                $user->update($userData);
            } else {
                $user = User::create($userData);
            }

            $employeeData = collect($data)->except(['id', 'name', 'email', 'password', 'profile_photo'])->all();
            $employeeData['user_id'] = $user->id;
            $employeeData['weekly_offs'] = array_values(array_map('intval', $data['weekly_offs'] ?? []));
            if ($request->hasFile('profile_photo')) {
                if ($employee?->profile_photo_path) {
                    Storage::delete($employee->profile_photo_path);
                }
                $employeeData['profile_photo_path'] = $request->file('profile_photo')->store('employee-profiles');
            }
            if ($employee) {
                $employee->update($employeeData);
            } else {
                $employee = Employee::create($employeeData);
            }

            return $employee;
        });

        $this->activity->log($request->user(), null, $employee->wasRecentlyCreated ? 'created' : 'updated', 'employee', $employee->id, "Employee {$employee->employee_code} saved");

        return $employee->load('user:id,name,email,role,active');
    }

    public function photo(Request $request, Employee $employee)
    {
        abort_unless($request->user()->role === 'employee' && $request->user()->id === $employee->user_id || $request->user()->hasPermission('view_employees'), 403);
        abort_unless($employee->profile_photo_path && Storage::exists($employee->profile_photo_path), 404);

        return Storage::response($employee->profile_photo_path);
    }
}
