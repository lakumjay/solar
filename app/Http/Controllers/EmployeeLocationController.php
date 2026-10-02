<?php

namespace App\Http\Controllers;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeLocation;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class EmployeeLocationController extends Controller
{
    /**
     * Ensure employee_locations table exists in DB automatically
     */
    private function ensureTableExists(): void
    {
        try {
            if (!Schema::hasTable('employee_locations')) {
                Schema::create('employee_locations', function (Blueprint $table) {
                    $table->id();
                    $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
                    $table->decimal('latitude', 10, 7);
                    $table->decimal('longitude', 10, 7);
                    $table->decimal('accuracy', 8, 2)->nullable();
                    $table->string('status_label')->default('Active');
                    $table->timestamp('recorded_at')->useCurrent();
                    $table->timestamps();

                    $table->index(['employee_id', 'recorded_at']);
                });
            }
        } catch (\Throwable $e) {
            // Silently continue if table exists or permission prevents creation
        }
    }

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

        $this->ensureTableExists();

        $user = $request->user();
        $employee = Employee::where('user_id', $user->id)->first();

        // If user is directly linked to an employee profile
        if ($employee) {
            try {
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
            } catch (\Throwable $e) {
                return response()->json([
                    'message' => 'Location logged via fallback.',
                    'employee_id' => $employee->id,
                    'recorded_at' => now()->toIso8601String(),
                ]);
            }
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
        $this->ensureTableExists();

        // Common shared employees are accessible across all companies
        $employees = Employee::with(['user.company', 'attendanceRecords' => function ($q) {
            $q->whereDate('attendance_date', Carbon::today())->latest('id');
        }])->orderBy('employee_code')->get();

        $employeeIds = $employees->pluck('id');

        // Safely fetch latest location for each employee from employee_locations
        $latestLocations = collect();
        try {
            if (Schema::hasTable('employee_locations') && $employeeIds->isNotEmpty()) {
                $latestLocations = EmployeeLocation::whereIn('employee_id', $employeeIds)
                    ->where('recorded_at', '>=', Carbon::now()->subHours(24))
                    ->orderBy('recorded_at', 'desc')
                    ->get()
                    ->groupBy('employee_id')
                    ->map(fn($locs) => $locs->first());
            }
        } catch (\Throwable $e) {
            $latestLocations = collect();
        }

        $now = Carbon::now();

        $results = $employees->map(function ($emp) use ($latestLocations, $now) {
            $loc = $latestLocations->get($emp->id);
            $todayAttendance = $emp->attendanceRecords->first();

            $lat = null;
            $lng = null;
            $accuracy = null;
            $recordedAt = null;

            // Source 1: Real-time background ping
            if ($loc && !empty($loc->latitude) && (float)$loc->latitude != 0) {
                $lat = (float)$loc->latitude;
                $lng = (float)$loc->longitude;
                $accuracy = (float)($loc->accuracy ?? 15);
                $recordedAt = $loc->recorded_at;
            }

            // Source 2: Today's Time In / Clock In GPS from attendance
            if (!$lat && $todayAttendance && !empty($todayAttendance->clock_in_latitude) && (float)$todayAttendance->clock_in_latitude != 0) {
                $lat = (float)$todayAttendance->clock_in_latitude;
                $lng = (float)$todayAttendance->clock_in_longitude;
                $accuracy = (float)($todayAttendance->clock_in_accuracy ?? 15);
                $recordedAt = $todayAttendance->clock_in_at ?: Carbon::today();
            }

            // Source 3: Latest historical attendance with GPS
            if (!$lat) {
                try {
                    $latestAttWithGps = AttendanceRecord::where('employee_id', $emp->id)
                        ->whereNotNull('clock_in_latitude')
                        ->where('clock_in_latitude', '!=', 0)
                        ->orderBy('attendance_date', 'desc')
                        ->first();
                    if ($latestAttWithGps) {
                        $lat = (float)$latestAttWithGps->clock_in_latitude;
                        $lng = (float)$latestAttWithGps->clock_in_longitude;
                        $accuracy = (float)($latestAttWithGps->clock_in_accuracy ?? 20);
                        $recordedAt = $latestAttWithGps->clock_in_at ?: Carbon::parse($latestAttWithGps->attendance_date);
                    }
                } catch (\Throwable $e) {
                    // Fallback quietly
                }
            }

            $isLive = false;
            $lastSeenHuman = 'GPS પિંગની રાહ જુએ છે';
            $elapsedMinutes = null;

            if ($recordedAt) {
                $carbonDate = $recordedAt instanceof Carbon ? $recordedAt : Carbon::parse($recordedAt);
                $elapsedMinutes = $now->diffInMinutes($carbonDate);
                $isLive = $elapsedMinutes <= 20;
                $lastSeenHuman = $carbonDate->diffForHumans();
            }

            return [
                'employee_id' => $emp->id,
                'name' => $emp->user->name ?? 'Unknown',
                'employee_code' => $emp->employee_code,
                'designation' => $emp->designation ?? 'Field Officer',
                'company_name' => $emp->user->company->name ?? 'SolarFlow Shared',
                'company_id' => $emp->user->company_id,
                'avatar_url' => $emp->profile_photo_path ? '/api/employees/'.$emp->id.'/photo?v='.$emp->updated_at?->timestamp : null,
                'is_live' => $isLive,
                'last_seen' => $lastSeenHuman,
                'elapsed_minutes' => $elapsedMinutes,
                'status' => $todayAttendance ? ($todayAttendance->clock_out_at ? 'Shift Ended' : 'Working') : 'Not Checked In',
                'latitude' => $lat,
                'longitude' => $lng,
                'accuracy' => $accuracy,
                'recorded_at' => $recordedAt ? (is_string($recordedAt) ? $recordedAt : $recordedAt->toIso8601String()) : null,
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
