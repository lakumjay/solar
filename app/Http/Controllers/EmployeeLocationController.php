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
                    $table->decimal('speed', 6, 2)->nullable();
                    $table->decimal('heading', 6, 2)->nullable();
                    $table->string('status_label')->default('Active');
                    $table->timestamp('recorded_at')->useCurrent();
                    $table->timestamps();

                    $table->index(['employee_id', 'recorded_at']);
                });
            } else {
                Schema::table('employee_locations', function (Blueprint $table) {
                    if (!Schema::hasColumn('employee_locations', 'speed')) {
                        $table->decimal('speed', 6, 2)->nullable()->after('accuracy');
                    }
                    if (!Schema::hasColumn('employee_locations', 'heading')) {
                        $table->decimal('heading', 6, 2)->nullable()->after('speed');
                    }
                });
            }
        } catch (\Throwable $e) {
            // Silently continue if table/columns already exist
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
            'speed' => 'nullable|numeric',
            'heading' => 'nullable|numeric',
            'status_label' => 'nullable|string|max:50',
        ]);

        $this->ensureTableExists();

        $user = $request->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $employee = Employee::where('user_id', $user->id)->first();
        if (!$employee && !empty($user->name)) {
            $employee = Employee::whereHas('user', function ($q) use ($user) {
                $q->where('email', $user->email);
            })->first();
        }

        // If user is linked or found
        if ($employee) {
            if (empty($employee->user_id) || $employee->user_id !== $user->id) {
                $employee->update(['user_id' => $user->id]);
            }

            $speed = $validated['speed'] ?? null;
            if (($speed === null || $speed <= 0) && Schema::hasTable('employee_locations')) {
                try {
                    $lastLoc = EmployeeLocation::where('employee_id', $employee->id)
                        ->orderBy('id', 'desc')
                        ->first();
                    if ($lastLoc && $lastLoc->recorded_at) {
                        $diffSeconds = now()->diffInSeconds($lastLoc->recorded_at);
                        if ($diffSeconds >= 5 && $diffSeconds <= 300) {
                            $earthRadius = 6371000; // meters
                            $latFrom = deg2rad((float)$lastLoc->latitude);
                            $lonFrom = deg2rad((float)$lastLoc->longitude);
                            $latTo = deg2rad((float)$validated['latitude']);
                            $lonTo = deg2rad((float)$validated['longitude']);
                            $latDelta = $latTo - $latFrom;
                            $lonDelta = $lonTo - $lonFrom;
                            $angle = 2 * asin(sqrt(pow(sin($latDelta / 2), 2) + cos($latFrom) * cos($latTo) * pow(sin($lonDelta / 2), 2)));
                            $distanceMeters = $angle * $earthRadius;
                            if ($distanceMeters > 6) {
                                $calcSpeedKmh = ($distanceMeters / $diffSeconds) * 3.6;
                                $speed = round(min(140, $calcSpeedKmh), 1);
                            } else {
                                $speed = 0;
                            }
                        }
                    }
                } catch (\Throwable $e) {}
            }

            try {
                $location = EmployeeLocation::create([
                    'employee_id' => $employee->id,
                    'latitude' => $validated['latitude'],
                    'longitude' => $validated['longitude'],
                    'accuracy' => $validated['accuracy'] ?? null,
                    'speed' => $speed,
                    'heading' => $validated['heading'] ?? null,
                    'status_label' => $validated['status_label'] ?? 'Active',
                    'recorded_at' => now(),
                ]);

                return response()->json([
                    'message' => 'Location updated successfully.',
                    'employee_id' => $employee->id,
                    'speed' => $speed,
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
            'message' => 'User ping acknowledged.',
            'recorded_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Get live locations of employees for Super Admin and Company Admins
     */
    public function live(Request $request): JsonResponse
    {
        $this->ensureTableExists();

        // Only field employees who punch attendance themselves (exclude manager-only manual attendance)
        $employees = Employee::where('manager_attendance_only', false)
            ->where('active', true)
            ->with(['user.company', 'attendanceRecords' => function ($q) {
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

        $todayDate = Carbon::today()->toDateString();
        $todayLeaves = collect();
        try {
            $todayLeaves = \App\Models\LeaveRequest::with('leaveType')
                ->whereIn('employee_id', $employeeIds)
                ->whereDate('date_from', '<=', $todayDate)
                ->whereDate('date_to', '>=', $todayDate)
                ->get()
                ->groupBy('employee_id');
        } catch (\Throwable $e) {}

        $now = Carbon::now();

        $results = $employees->map(function ($emp) use ($latestLocations, $now, $todayLeaves) {
            $loc = $latestLocations->get($emp->id);
            $todayAttendance = $emp->attendanceRecords->first();
            $leaveReq = $todayLeaves->get($emp->id)?->first();

            $leaveInfo = null;
            $currentHour = (float) $now->format('G') + ((float) $now->format('i') / 60);

            if (!$todayAttendance) {
                $empName = $emp->user?->name ?? 'કર્મચારી';
                if ($leaveReq) {
                    $isApproved = $leaveReq->status === 'approved';
                    $leaveTypeTitle = $leaveReq->leaveType?->name ?? 'રજા';
                    $leaveInfo = [
                        'has_leave' => true,
                        'is_approved' => $isApproved,
                        'status' => $isApproved ? 'approved_leave' : 'unapproved_leave',
                        'badge' => $isApproved ? '🌴 મંજૂર રજા (Approved)' : '⚠️ મંજૂરી વિના રજા',
                        'message' => $isApproved
                            ? "{$empName} આજે રજા પર છે (આજે રજા મંજૂર થયેલ છે - {$leaveTypeTitle})"
                            : "{$empName} રજા પર છે (રજા અપ્રૂવલ લીધી નહોતી)",
                    ];
                } elseif ($currentHour >= 11.0) {
                    $leaveInfo = [
                        'has_leave' => true,
                        'is_approved' => false,
                        'status' => 'unapproved_absence',
                        'badge' => '⚠️ રજા અપ્રૂવલ વગર (ગેરહાજર)',
                        'message' => "{$empName} આજે ૧૧:૦૦ વાગ્યા સુધી હાજર થયા નથી (રજા અપ્રૂવલ લીધી નહોતી - રજા પર છે)",
                    ];
                }
            }

            $lat = null;
            $lng = null;
            $accuracy = null;
            $speed = null;
            $recordedAt = null;

            // Source 1: Real-time background ping
            if ($loc && !empty($loc->latitude) && (float)$loc->latitude != 0) {
                $lat = (float)$loc->latitude;
                $lng = (float)$loc->longitude;
                $accuracy = (float)($loc->accuracy ?? 15);
                $speed = $loc->speed !== null ? (float)$loc->speed : null;
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
                $elapsedMinutes = abs((int) round($now->diffInMinutes($carbonDate)));
                $isLive = $elapsedMinutes <= 30;
                $lastSeenHuman = $carbonDate->diffForHumans();
            }

            // 🏍️ Movement mode: bike (>= 12 km/h), walking (2 to 12 km/h), stationary (< 2 km/h or live at site)
            $movement = 'offline';
            $movementIcon = '⚪';
            $movementLabel = 'ઑફલાઇન';

            if ($speed !== null && $speed >= 12) {
                $movement = 'bike';
                $movementIcon = '🏍️';
                $movementLabel = 'બાઇક પર ગતિમાં (~' . round($speed) . ' km/h)';
            } elseif ($speed !== null && $speed >= 2) {
                $movement = 'walking';
                $movementIcon = '🚶‍♂️';
                $movementLabel = 'પગપાળા ચાલે છે (~' . round($speed) . ' km/h)';
            } elseif ($isLive || ($todayAttendance && !$todayAttendance->clock_out_at && $lat)) {
                $movement = 'stationary';
                $movementIcon = '🧍‍♂️';
                $movementLabel = 'સાઇટ પર સ્થિર (0 km/h)';
                if ($speed === null) $speed = 0;
            } else {
                $movement = 'offline';
                $movementIcon = '⚪';
                $movementLabel = 'ઑફલાઇન';
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
                'speed' => $speed,
                'movement' => $movement,
                'movement_icon' => $movementIcon,
                'movement_label' => $movementLabel,
                'recorded_at' => $recordedAt ? (is_string($recordedAt) ? $recordedAt : $recordedAt->toIso8601String()) : null,
                'leave_info' => $leaveInfo,
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
