<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\EmployeeLocation;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeLocationController extends Controller
{
    /**
     * Periodic background GPS ping from employee device
     */
    public function ping(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'accuracy' => 'nullable|numeric',
            'status_label' => 'nullable|string|max:50',
        ]);

        $user = $request->user();
        $employee = Employee::where('user_id', $user->id)->first();

        if (!$employee) {
            return response()->json(['message' => 'Employee profile not found.'], 404);
        }

        $location = EmployeeLocation::create([
            'employee_id' => $employee->id,
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'accuracy' => $validated['accuracy'] ?? null,
            'status_label' => $validated['status_label'] ?? 'Active',
            'recorded_at' => now(),
        ]);

        return response()->json([
            'message' => 'Location updated successfully.',
            'recorded_at' => $location->recorded_at->toIso8601String(),
        ]);
    }

    /**
     * Get live locations of employees for Super Admin and Company Admins
     */
    public function live(Request $request): JsonResponse
    {
        $user = $request->user();
        $companyId = $request->query('company_id');

        $query = Employee::with(['user.company', 'attendanceRecords' => function ($q) {
            $q->whereDate('attendance_date', Carbon::today())->latest('id');
        }])->where('active', true);

        if ($user->role !== 'super_admin') {
            if ($user->company_id) {
                $query->whereHas('user', fn($q) => $q->where('company_id', $user->company_id));
            }
        } elseif ($companyId && $companyId !== 'all') {
            $query->whereHas('user', fn($q) => $q->where('company_id', $companyId));
        }

        $employees = $query->get();
        $employeeIds = $employees->pluck('id');

        // Fetch latest location for each employee
        $latestLocations = EmployeeLocation::whereIn('employee_id', $employeeIds)
            ->where('recorded_at', '>=', Carbon::now()->subHours(24))
            ->orderBy('recorded_at', 'desc')
            ->get()
            ->groupBy('employee_id')
            ->map(fn($locs) => $locs->first());

        $now = Carbon::now();

        $results = $employees->map(function ($emp) use ($latestLocations, $now) {
            $loc = $latestLocations->get($emp->id);
            $todayAttendance = $emp->attendanceRecords->first();

            $isLive = false;
            $lastSeenHuman = 'No recent GPS';
            $elapsedMinutes = null;

            if ($loc) {
                $elapsedMinutes = $now->diffInMinutes($loc->recorded_at);
                // Live if recorded within the last 15 minutes
                $isLive = $elapsedMinutes <= 15;
                $lastSeenHuman = $loc->recorded_at->diffForHumans();
            }

            return [
                'employee_id' => $emp->id,
                'name' => $emp->user->name ?? 'Unknown',
                'employee_code' => $emp->employee_code,
                'designation' => $emp->designation ?? 'Field Officer',
                'company_name' => $emp->user->company->name ?? 'SolarFlow Shared',
                'company_id' => $emp->user->company_id,
                'avatar_url' => $emp->profile_photo_path ? route('employees.photo', $emp->id) : null,
                'is_live' => $isLive,
                'last_seen' => $lastSeenHuman,
                'elapsed_minutes' => $elapsedMinutes,
                'status' => $todayAttendance ? ($todayAttendance->time_out ? 'Shift Ended' : 'Working') : 'Not Checked In',
                'latitude' => $loc ? (float)$loc->latitude : null,
                'longitude' => $loc ? (float)$loc->longitude : null,
                'accuracy' => $loc ? (float)$loc->accuracy : null,
                'recorded_at' => $loc ? $loc->recorded_at->toIso8601String() : null,
                'map_url' => $loc ? "https://www.google.com/maps?q={$loc->latitude},{$loc->longitude}" : null,
            ];
        });

        return response()->json([
            'employees' => $results,
            'live_count' => $results->where('is_live', true)->count(),
            'total_count' => $results->count(),
            'updated_at' => now()->toIso8601String(),
        ]);
    }
}
