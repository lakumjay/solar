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

        // If user is directly linked to an employee profile
        if ($employee) {
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
                'employee_id' => $employee->id,
                'recorded_at' => $location->recorded_at->toIso8601String(),
            ]);
        }

        return response()->json([
            'message' => 'Admin ping acknowledged.',
            'recorded_at' => now()->toIso8601String(),
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

        // Fetch latest location for each employee from employee_locations
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

            $lat = $loc ? (float)$loc->latitude : null;
            $lng = $loc ? (float)$loc->longitude : null;
            $accuracy = $loc ? (float)$loc->accuracy : null;
            $recordedAt = $loc ? $loc->recorded_at : null;

            // Fallback: If no periodic ping yet today, use today's Clock-in GPS coordinates!
            if (!$lat && $todayAttendance && $todayAttendance->clock_in_latitude && $todayAttendance->clock_in_longitude) {
                $lat = (float)$todayAttendance->clock_in_latitude;
                $lng = (float)$todayAttendance->clock_in_longitude;
                $accuracy = (float)($todayAttendance->clock_in_accuracy ?? 15);
                $recordedAt = $todayAttendance->clock_in_at ?: Carbon::today();
            }

            $isLive = false;
            $lastSeenHuman = 'GPS પિંગની રાહ જુએ છે';
            $elapsedMinutes = null;

            if ($recordedAt) {
                $elapsedMinutes = $now->diffInMinutes($recordedAt);
                // Live if recorded within the last 20 minutes
                $isLive = $elapsedMinutes <= 20;
                $lastSeenHuman = $recordedAt->diffForHumans();
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
                'status' => $todayAttendance ? ($todayAttendance->clock_out_at ? 'Shift Ended' : 'Working') : 'Not Checked In',
                'latitude' => $lat,
                'longitude' => $lng,
                'accuracy' => $accuracy,
                'recorded_at' => $recordedAt ? $recordedAt->toIso8601String() : null,
                'map_url' => $lat && $lng ? "https://www.google.com/maps?q={$lat},{$lng}" : null,
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
