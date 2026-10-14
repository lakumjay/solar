<?php

namespace App\Services;

use App\Models\AttendanceRecord;
use App\Models\Company;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class SmartVoiceCallAlertService
{
    public const SETTINGS_CACHE_KEY = 'ai_call_settings_v1';

    /**
     * Default ON/OFF configuration for all automated AI Voice Calls.
     */
    public function defaultCallSettings(): array
    {
        return [
            'master_enabled' => true,
            'inverter_shutdown' => true,
            'grid_66kv_tripping' => true,
            'employee_missing_clock_in' => true,
            'attendance_pending_4pm' => true,
            'employee_logout_630pm' => true,
            'employee_logout_700pm' => true,
            'muted_company_ids' => [],
            'maintenance_note' => '',
            'updated_at' => null,
            'updated_by' => null,
        ];
    }

    /**
     * Get current AI Voice Call ON/OFF settings (from fast cache or persistent JSON file).
     */
    public function getCallSettings(): array
    {
        $defaults = $this->defaultCallSettings();
        try {
            $cached = Cache::get(self::SETTINGS_CACHE_KEY);
            if (is_array($cached)) {
                return array_merge($defaults, $cached);
            }

            $filePath = storage_path('app/ai_call_settings.json');
            if (File::exists($filePath)) {
                $decoded = json_decode((string) File::get($filePath), true);
                if (is_array($decoded)) {
                    $merged = array_merge($defaults, $decoded);
                    Cache::forever(self::SETTINGS_CACHE_KEY, $merged);
                    return $merged;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('SmartVoiceCallAlertService getCallSettings notice: ' . $e->getMessage());
        }

        return $defaults;
    }

    /**
     * Update AI Voice Call ON/OFF settings and immediately cancel any active/queued calls that were turned OFF.
     */
    public function saveCallSettings(array $input, ?string $updatedBy = null): array
    {
        $current = $this->getCallSettings();
        $boolKeys = [
            'master_enabled',
            'inverter_shutdown',
            'grid_66kv_tripping',
            'employee_missing_clock_in',
            'attendance_pending_4pm',
            'employee_logout_630pm',
            'employee_logout_700pm',
        ];

        foreach ($boolKeys as $key) {
            if (array_key_exists($key, $input)) {
                $current[$key] = filter_var($input[$key], FILTER_VALIDATE_BOOLEAN);
            }
        }

        if (array_key_exists('muted_company_ids', $input) && is_array($input['muted_company_ids'])) {
            $current['muted_company_ids'] = array_values(array_unique(array_map('intval', $input['muted_company_ids'])));
        }

        if (array_key_exists('maintenance_note', $input)) {
            $current['maintenance_note'] = mb_substr(trim((string) $input['maintenance_note']), 0, 250);
        }

        $current['updated_at'] = now()->toIso8601String();
        if ($updatedBy) {
            $current['updated_by'] = $updatedBy;
        }

        try {
            $filePath = storage_path('app/ai_call_settings.json');
            File::put($filePath, json_encode($current, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            Cache::forever(self::SETTINGS_CACHE_KEY, $current);
            Cache::forget('smart_voice_call_rules_evaluated_lock');
        } catch (\Throwable $e) {
            Log::error('SmartVoiceCallAlertService saveCallSettings error: ' . $e->getMessage());
        }

        // Immediately clear any active calls that belong to disabled rules or muted companies
        $this->purgeDisabledActiveCalls($current);

        return $current;
    }

    /**
     * Clear any currently queued/ringing calls that have been toggled OFF.
     */
    public function purgeDisabledActiveCalls(?array $settings = null): void
    {
        $settings = $settings ?? $this->getCallSettings();
        $mutedCompanies = array_map('intval', $settings['muted_company_ids'] ?? []);

        try {
            $users = User::where('active', true)->get(['id', 'role', 'name']);
            foreach ($users as $u) {
                $key = $this->userCacheKey($u->id);
                $call = Cache::get($key);
                if ($call && ! $this->isCallAllowedBySettings($call, $settings, $mutedCompanies)) {
                    Cache::forget($key);
                }
            }

            $superCall = Cache::get('active_emergency_call_super_admin');
            if ($superCall && ! $this->isCallAllowedBySettings($superCall, $settings, $mutedCompanies)) {
                Cache::forget('active_emergency_call_super_admin');
            }
        } catch (\Throwable $e) {}
    }

    private function isCallAllowedBySettings(array $call, array $settings, array $mutedCompanies = []): bool
    {
        if (empty($settings['master_enabled'])) {
            return false;
        }
        $faultType = $call['fault_type'] ?? '';
        if ($faultType !== '' && array_key_exists($faultType, $settings) && empty($settings[$faultType])) {
            return false;
        }
        $compId = isset($call['company_id']) ? (int) $call['company_id'] : 0;
        if ($compId > 0 && $faultType === 'inverter_shutdown' && in_array($compId, $mutedCompanies, true)) {
            return false;
        }
        return true;
    }

    /**
     * Evaluate all automated AI Voice Call rules (throttled to run at most once every 20s)
     * and return any pending voice call for the specified user.
     */
    public function evaluateAndGetActiveCallForUser(?User $user, ?array $liveOverview = null): ?array
    {
        if (! $user) {
            return null;
        }

        $settings = $this->getCallSettings();
        if (empty($settings['master_enabled'])) {
            $this->dismissCallForUser($user);
            return null;
        }

        if (Cache::has("call_dismissed_until_{$user->id}")) {
            return null;
        }

        try {
            // Run global rule evaluation at most once every 20 seconds
            if (! Cache::has('smart_voice_call_rules_evaluated_lock')) {
                Cache::put('smart_voice_call_rules_evaluated_lock', true, 20);
                $this->evaluateAllRules($liveOverview);
            }
        } catch (\Throwable $e) {
            Log::warning('SmartVoiceCallAlertService evaluation notice: ' . $e->getMessage());
        }

        $call = Cache::get($this->userCacheKey($user->id));
        if (! $call && ($user->role === 'super_admin' || $user->name === 'Super Admin' || $user->id === 4)) {
            $call = Cache::get('active_emergency_call_super_admin');
        }

        if ($call) {
            $mutedCompanies = array_map('intval', $settings['muted_company_ids'] ?? []);
            if (! $this->isCallAllowedBySettings($call, $settings, $mutedCompanies)) {
                $this->dismissCallForUser($user);
                return null;
            }

            // Auto-clear attendance/logout call if the employee already completed the action
            $faultType = $call['fault_type'] ?? '';
            $isTelemetryLive = ! empty($liveOverview['live']) || ! empty($liveOverview['is_live']);
            if (in_array($faultType, ['inverter_shutdown', 'grid_66kv_tripping'], true) && $liveOverview !== null && ! $isTelemetryLive) {
                $this->dismissCallForUser($user);
                return null;
            }
            if (in_array($faultType, ['employee_missing_clock_in', 'attendance_pending_4pm', 'employee_logout_630pm', 'employee_logout_700pm'], true)) {
                $emp = Employee::where('user_id', $user->id)->first();
                if ($emp) {
                    $rec = AttendanceRecord::where('employee_id', $emp->id)
                        ->whereDate('attendance_date', Carbon::today()->toDateString())
                        ->first();
                    if (in_array($faultType, ['employee_missing_clock_in', 'attendance_pending_4pm'], true) && $rec && $rec->clock_in_at) {
                        $this->dismissCallForUser($user);
                        return null;
                    }
                    if (in_array($faultType, ['employee_logout_630pm', 'employee_logout_700pm'], true) && $rec && $rec->clock_out_at) {
                        $this->dismissCallForUser($user);
                        return null;
                    }
                }
            }
        }

        return $call;
    }

    public function dismissCallForUser(?User $user): void
    {
        if (! $user) {
            return;
        }
        Cache::forget($this->userCacheKey($user->id));
        if ($user->role === 'super_admin' || $user->name === 'Super Admin' || $user->id === 4) {
            Cache::forget('active_emergency_call_super_admin');
        }
        // Set cooldown so dismissed calls do not instantly re-trigger and block the user's screen
        Cache::put("call_dismissed_until_{$user->id}", true, now()->addMinutes(30));
    }

    /**
     * Evaluate all 5 automated AI Voice Call triggers:
     * 1. Company Inverter Shutdown -> Call Company Founder/Admin + Super Admin
     * 2. 66KV Grid Substation Line Trip -> Call Super Admin + Company Admins
     * 3. Employee Morning Missing Clock-In (not on Holiday / Weekly Off / Approved Leave) -> Call Employee
     * 4. 4:00 PM Attendance Pending -> Call Super Admin + Admins/Managers + Employee
     * 5. 6:30 PM Logout Reminder & 7:00 PM (30m later) Urgent Logout Call -> Call Employee
     */
    public function evaluateAllRules(?array $liveOverview = null): void
    {
        $settings = $this->getCallSettings();
        if (empty($settings['master_enabled'])) {
            return;
        }
        $mutedCompanies = array_map('intval', $settings['muted_company_ids'] ?? []);

        $now = Carbon::now();
        $todayStr = $now->toDateString();
        $hourFloat = (float) $now->format('G') + ((float) $now->format('i') / 60.0);

        if (empty($liveOverview)) {
            $liveOverview = Cache::get('dashboard_solar_overview_all');
        }

        // CRITICAL GUARD: Only evaluate Inverter / 66KV Grid calls if iSolarCloud live telemetry is 100% connected ($isTelemetryLive === true).
        // If the iSolarCloud token is expired or disconnected, NEVER trigger false Inverter Shutdown calls to company founders!
        $isTelemetryLive = ! empty($liveOverview['live']) || ! empty($liveOverview['is_live']);
        $totalPlantOnline = (int) ($liveOverview['online_count'] ?? 0);

        // ── 1 & 2: Daytime Solar Inverter Shutdown & 66KV Grid Trip (07:45 AM to 17:45 PM) ──
        if (! empty($liveOverview) && $isTelemetryLive && $hourFloat >= 7.75 && $hourFloat <= 17.75) {
            $isGridDown = ! empty($liveOverview['grid_downtime_tracker']['is_down'])
                || ! empty($liveOverview['smart_insights']['grid_downtime']['is_down']);

            if ($isGridDown) {
                if (! empty($settings['grid_66kv_tripping'])) {
                    $gridLockKey = "ai_voice_call_grid_66kv_{$todayStr}_" . $now->format('H');
                    if (! Cache::has($gridLockKey)) {
                        Cache::put($gridLockKey, true, now()->addMinutes(45));
                        $speechGu = 'નમસ્તે! સોલારફ્લો એઆઈ ઇમરજન્સી એલર્ટ છે. ૬૬KV સબસ્ટેશન લાઇન ટ્રીપ થઈ ગઈ છે અથવા પ્લાન્ટમાં કુલ ઉત્પાદન ૦ કિલોવોટ થઈ ગયું છે. કૃપા કરીને તાત્કાલિક સાઇટ ટીમ અથવા ઇજનેરનો સંપર્ક કરો અને ગ્રીડ ચેક કરો.';

                        $superAdmins = User::where('role', 'super_admin')->where('active', true)->get();
                        foreach ($superAdmins as $admin) {
                            $this->dispatchCallToUser($admin, [
                                'caller_name' => '⚡ SolarFlow AI Emergency',
                                'alert_title' => '🚨 ૬૬KV સબસ્ટેશન લાઇન ટ્રીપ એલર્ટ',
                                'plant_name' => 'ઓલ સોલાર પ્લાન્ટ્સ (૬૬KV લાઇન)',
                                'fault_type' => 'grid_66kv_tripping',
                                'speech_text' => $speechGu,
                            ]);
                        }
                    }
                }
            } elseif ($totalPlantOnline > 0 && ! empty($settings['inverter_shutdown'])) {
                // Check individual company inverter shutdown (only when at least 1 other inverter in plant is online)
                foreach ($liveOverview['companies'] ?? [] as $compData) {
                    $compId = $compData['company_id'] ?? null;
                    $compName = $compData['company_name'] ?? 'Solar Plant';
                    $isCompCurtailed = ! empty($compData['is_curtailed']);
                    $onlineCount = (int) ($compData['online_count'] ?? 0);

                    if ($isCompCurtailed) {
                        continue;
                    }

                    // Skip company if its calls are muted for maintenance
                    if ($compId && in_array((int) $compId, $mutedCompanies, true)) {
                        continue;
                    }

                    foreach ($compData['inverters'] ?? [] as $inv) {
                        $invId = $inv['id'] ?? 0;
                        $invName = $inv['name'] ?? 'Inverter';
                        $isOnline = ! empty($inv['online']);
                        $isInvCurtailed = ! empty($inv['is_curtailed']);
                        $liveKw = (float) ($inv['live_kw'] ?? 0);

                        // Trigger if inverter is offline or dropped to 0 kW while other inverters are online
                        $isInverterDown = ! $isInvCurtailed && (! $isOnline || ($onlineCount > 0 && $liveKw <= 0.05 && $hourFloat >= 8.5 && $hourFloat <= 17.0));

                        if ($isInverterDown) {
                            $invLockKey = "ai_voice_call_inv_down_{$compId}_{$invId}_{$todayStr}_" . $now->format('H');
                            if (! Cache::has($invLockKey)) {
                                Cache::put($invLockKey, true, now()->addMinutes(45));

                                $companyModel = $compId ? Company::find($compId) : null;
                                $founderName = $companyModel?->owner_name ?: $compName;

                                // 1. Call Company Founder / Admin
                                if ($compId) {
                                    $companyUsers = User::where('company_id', $compId)
                                        ->whereIn('role', ['company_admin', 'manager'])
                                        ->where('active', true)
                                        ->get();

                                    foreach ($companyUsers as $cUser) {
                                        $founderSpeech = "નમસ્તે {$founderName}! હું SolarFlow AI બોલું છું. {$compName} નું {$invName} હાલ બંધ થઈ ગયું છે અને ૦ કિલોવોટ પાવર આપે છે. કૃપા કરીને તાત્કાલિક સાઈટ પર {$invName} ચેક કરાવો.";
                                        $this->dispatchCallToUser($cUser, [
                                            'caller_name' => "⚡ {$compName} AI Alert",
                                            'alert_title' => "🚨 {$compName} - {$invName} બંધ છે!",
                                            'plant_name' => "{$compName} ({$invName})",
                                            'fault_type' => 'inverter_shutdown',
                                            'company_id' => (int) $compId,
                                            'speech_text' => $founderSpeech,
                                        ]);
                                    }
                                }

                                // 2. Call Super Admin as well
                                $superAdmins = User::where('role', 'super_admin')->where('active', true)->get();
                                foreach ($superAdmins as $sAdmin) {
                                    $adminSpeech = "નમસ્તે સુપર એડમિન! હું SolarFlow AI બોલું છું. {$compName} નું {$invName} હાલ બંધ થઈ ગયું છે અને ૦ કિલોવોટ પાવર આપે છે. {$founderName} અને તમને બંનેને આ ઇમરજન્સી જાણ કરવામાં આવી છે.";
                                    $this->dispatchCallToUser($sAdmin, [
                                        'caller_name' => "⚡ {$compName} AI Alert",
                                        'alert_title' => "🚨 {$compName} - {$invName} બંધ છે!",
                                        'plant_name' => "{$compName} ({$invName})",
                                        'fault_type' => 'inverter_shutdown',
                                        'company_id' => (int) $compId,
                                        'speech_text' => $adminSpeech,
                                    ]);
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Check if today is a full-day Company Holiday ──
        $isFullDayHoliday = Holiday::whereDate('holiday_date', $todayStr)
            ->where('active', true)
            ->where('type', 'full_day')
            ->exists();

        $employees = Employee::with(['user'])->where('active', true)->get();
        $missingAttendanceNames = [];

        foreach ($employees as $emp) {
            if (! $emp->user || ! $emp->user->active) {
                continue;
            }

            $empName = $emp->user->name ?: 'કર્મચારી';
            $todayRecord = AttendanceRecord::where('employee_id', $emp->id)
                ->whereDate('attendance_date', $todayStr)
                ->first();

            $hasClockedIn = $todayRecord && ! empty($todayRecord->clock_in_at);
            $hasClockedOut = $todayRecord && ! empty($todayRecord->clock_out_at);

            // Check Weekly Off
            $weeklyOffs = is_array($emp->weekly_offs) ? array_map('strtolower', $emp->weekly_offs) : [];
            $dayFull = strtolower($now->format('l'));   // e.g. sunday
            $dayShort = strtolower($now->format('D'));  // e.g. sun
            $isWeeklyOff = in_array($dayFull, $weeklyOffs, true) || in_array($dayShort, $weeklyOffs, true);

            // Check Approved Leave today
            $hasApprovedLeave = LeaveRequest::where('employee_id', $emp->id)
                ->where('status', 'approved')
                ->whereDate('date_from', '<=', $todayStr)
                ->whereDate('date_to', '>=', $todayStr)
                ->exists();

            $isWorkingDayForEmp = ! $isFullDayHoliday && ! $isWeeklyOff && ! $hasApprovedLeave;

            // ── 3: Employee Morning Clock-In Reminder (After shift start + grace, 09:30 AM to 15:55 PM) ──
            if ($isWorkingDayForEmp && ! $hasClockedIn) {
                $missingAttendanceNames[] = $empName;

                if (! empty($settings['employee_missing_clock_in'])) {
                    $shiftStartStr = $emp->shift_start ?: '09:00';
                    $graceMins = (int) ($emp->grace_minutes ?? 15);
                    try {
                        $shiftDeadline = Carbon::createFromFormat('H:i', substr($shiftStartStr, 0, 5))->addMinutes($graceMins + 15);
                    } catch (\Throwable $e) {
                        $shiftDeadline = Carbon::today()->setTime(9, 30);
                    }

                    if ($now->greaterThanOrEqualTo($shiftDeadline) && $hourFloat < 16.0) {
                        $slotBucket = (int) floor($hourFloat / 2); // Remind at most once every 2 hours in morning/afternoon
                        $morningLockKey = "ai_voice_call_emp_checkin_{$emp->id}_{$todayStr}_{$slotBucket}";
                        if (! Cache::has($morningLockKey)) {
                            Cache::put($morningLockKey, true, now()->addHours(2));
                            $speechGu = "નમસ્તે {$empName}! હું SolarFlow AI બોલું છું. આજે તમારી રજા મંજૂર નથી અને પ્લાન્ટમાં રજા પણ નથી, છતાં તમે હજુ સુધી એપમાં હાજરી (Clock-In) પૂરી નથી. કૃપા કરીને હાલ જ તમારી હાજરી પૂરી લો.";

                            $this->dispatchCallToUser($emp->user, [
                                'caller_name' => '⏰ SolarFlow AI Attendance',
                                'alert_title' => '📋 હાજરી (Clock-In) બાકી છે!',
                                'plant_name' => 'SolarFlow Attendance Reminder',
                                'fault_type' => 'employee_missing_clock_in',
                                'speech_text' => $speechGu,
                            ]);
                        }
                    }
                }
            }

            // ── 4 (Part A): 4:00 PM Employee Attendance Reminder (16:00 to 17:45) ──
            if (! empty($settings['attendance_pending_4pm']) && $isWorkingDayForEmp && ! $hasClockedIn && $hourFloat >= 16.0 && $hourFloat <= 17.75) {
                $emp4pmLock = "ai_voice_call_4pm_emp_{$emp->id}_{$todayStr}";
                if (! Cache::has($emp4pmLock)) {
                    Cache::put($emp4pmLock, true, now()->addHours(6));
                    $speechGu = "નમસ્તે {$empName}! હું SolarFlow AI બોલું છું. સાંજના ૪ વાગી ગયા છે અને તમે હજુ સુધી આજની હાજરી (Attendance) પૂરી નથી. કૃપા કરીને તાત્કાલિક હાજરી પૂરી લો.";

                    $this->dispatchCallToUser($emp->user, [
                        'caller_name' => '🕓 SolarFlow AI (4:00 PM Reminder)',
                        'alert_title' => '🕓 ૪:૦૦ વાગ્યા — હાજરી બાકી છે!',
                        'plant_name' => 'SolarFlow Daily Attendance',
                        'fault_type' => 'attendance_pending_4pm',
                        'speech_text' => $speechGu,
                    ]);
                }
            }

            // ── 5 (Part A): 6:30 PM Logout (Clock-Out) First Call (18:30 to 18:59) ──
            if (! empty($settings['employee_logout_630pm']) && $hasClockedIn && ! $hasClockedOut && $hourFloat >= 18.5 && $hourFloat < 19.0) {
                $logout630Lock = "ai_voice_call_logout_630_{$emp->id}_{$todayStr}";
                if (! Cache::has($logout630Lock)) {
                    Cache::put($logout630Lock, true, now()->addHours(5));
                    $speechGu = "નમસ્તે {$empName}! હું SolarFlow AI બોલું છું. સાંજના સાડા છ વાગી ગયા છે. તમે ઘરે જતી વખતે એપમાં લોગઆઉટ (Clock-Out) કરવાનું ભૂલી ગયા છો. કૃપા કરીને હાલ જ લોગઆઉટ કરી દો.";

                    $this->dispatchCallToUser($emp->user, [
                        'caller_name' => '🕡 SolarFlow AI Logout Alert',
                        'alert_title' => '🚪 લોગઆઉટ (Clock-Out) કરવાનું બાકી છે!',
                        'plant_name' => '૬:૩૦ PM શિફ્ટ પૂર્ણ રિમાઇન્ડર',
                        'fault_type' => 'employee_logout_630pm',
                        'speech_text' => $speechGu,
                    ]);
                }
            }

            // ── 5 (Part B): 7:00 PM (30 Mins After 6:30 PM) Urgent Logout Call (19:00 to 21:30) ──
            if (! empty($settings['employee_logout_700pm']) && $hasClockedIn && ! $hasClockedOut && $hourFloat >= 19.0 && $hourFloat <= 21.5) {
                $logout700Lock = "ai_voice_call_logout_700_{$emp->id}_{$todayStr}";
                if (! Cache::has($logout700Lock)) {
                    Cache::put($logout700Lock, true, now()->addHours(5));
                    $speechGu = "નમસ્તે {$empName}! હું SolarFlow AI બોલું છું. સાડા છ વાગ્યાના રિમાઇન્ડર પછી ૩૦ મિનિટ થઈ ગઈ છે, છતાં તમે હજુ સુધી લોગઆઉટ (Clock-Out) નથી કર્યું. તાત્કાલિક એપ ખોલીને હાલ જ લોગઆઉટ કરો!";

                    $this->dispatchCallToUser($emp->user, [
                        'caller_name' => '🚨 SolarFlow AI Urgent Logout',
                        'alert_title' => '🚨 ૩૦ મિનિટ થઈ ગઈ — હજુ લોગઆઉટ નથી કર્યું!',
                        'plant_name' => '૭:૦૦ PM અર્જન્ટ લોગઆઉટ કૉલ',
                        'fault_type' => 'employee_logout_700pm',
                        'speech_text' => $speechGu,
                    ]);
                }
            }
        }

        // ── 4 (Part B): 4:00 PM Attendance Reminder Call to Super Admin & Company Admins / Managers ──
        if (! empty($settings['attendance_pending_4pm']) && ! empty($missingAttendanceNames) && $hourFloat >= 16.0 && $hourFloat <= 17.75) {
            $admin4pmLock = "ai_voice_call_4pm_admins_{$todayStr}";
            if (! Cache::has($admin4pmLock)) {
                Cache::put($admin4pmLock, true, now()->addHours(6));
                $namesList = implode(', ', $missingAttendanceNames);

                $adminsAndManagers = User::whereIn('role', ['super_admin', 'company_admin', 'manager'])
                    ->where('active', true)
                    ->get();

                foreach ($adminsAndManagers as $adm) {
                    $titleName = $adm->role === 'super_admin' ? 'સુપર એડમિન' : ($adm->name ?: 'સર');
                    $speechGu = "નમસ્તે {$titleName}! હું SolarFlow AI બોલું છું. સાંજના ૪ વાગી ગયા છે અને આજે {$namesList} ની હાજરી પૂરવાની બાકી છે. કૃપા કરીને હાજરી પૂરી લો.";

                    $this->dispatchCallToUser($adm, [
                        'caller_name' => '🕓 SolarFlow AI Attendance',
                        'alert_title' => '🕓 ૪:૦૦ વાગ્યા — આજની હાજરી બાકી છે!',
                        'plant_name' => "બાકી હાજરી: {$namesList}",
                        'fault_type' => 'attendance_pending_4pm',
                        'speech_text' => $speechGu,
                    ]);
                }
            }
        }
    }

    /**
     * Store active call in user cache, pre-warm neural Gujarati TTS audio, and send Web Push notification.
     */
    public function dispatchCallToUser(User $user, array $data): array
    {
        $voiceName = $data['voice_name'] ?? 'Aoede';

        $callPayload = [
            'id' => 'ai_call_' . $user->id . '_' . time(),
            'caller_name' => $data['caller_name'] ?? '⚡ SolarFlow AI Dispatch',
            'caller_number' => '+91 1800-SOLAR-AI',
            'alert_title' => $data['alert_title'] ?? '🚨 SolarFlow AI Voice Alert',
            'speech_text' => $data['speech_text'] ?? '',
            'voice_name' => $voiceName,
            'plant_name' => $data['plant_name'] ?? 'SolarFlow Plant',
            'fault_type' => $data['fault_type'] ?? 'general_alert',
            'company_id' => $data['company_id'] ?? null,
            'engineer_phone' => env('EMERGENCY_ENGINEER_PHONE', '+919909900066'),
            'target_user_id' => $user->id,
            'timestamp' => now()->toIso8601String(),
        ];

        Cache::put($this->userCacheKey($user->id), $callPayload, now()->addMinutes(15));
        if ($user->role === 'super_admin' || $user->name === 'Super Admin' || $user->id === 4) {
            Cache::put('active_emergency_call_super_admin', $callPayload, now()->addMinutes(15));
        }

        // Pre-warm authentic Gemini Aoede Gujarati TTS audio file so it plays instantaneously
        $this->prewarmTtsAudio($callPayload['speech_text'], 'gu', $voiceName);

        // Dispatch Web Push notification to this user's devices
        try {
            $webPushService = app(WebPushService::class);
            $webPushService->sendNotification([
                'title' => '📞 ' . $callPayload['caller_name'],
                'body' => $callPayload['alert_title'] . ' — કૉલ સાંભળવા માટે ટૅપ કરો.',
                'icon' => '/icons/icon-192.png',
                'badge' => '/icons/icon-192.png',
                'url' => '/?incoming_call=1&auto_answer=1',
                'data' => [
                    'type' => 'EMERGENCY_VOICE_CALL',
                    'url' => '/?incoming_call=1&auto_answer=1',
                    'call' => $callPayload,
                ],
                'vibrate' => [800, 250, 800, 250, 1000, 300, 1200],
                'sound' => '/sounds/alert.mp3',
                'requireInteraction' => true,
                'renotify' => true,
                'tag' => 'incoming-ai-call-' . $callPayload['fault_type'],
            ], $user->id);
        } catch (\Throwable $e) {
            Log::warning('WebPush AI voice call dispatch notice: ' . $e->getMessage());
        }

        return $callPayload;
    }

    private function prewarmTtsAudio(string $text, string $language = 'gu', string $voiceName = 'Aoede'): void
    {
        try {
            $cleanText = preg_replace('/[*_#`]/u', '', trim($text));
            $cleanText = mb_substr($cleanText, 0, 500);
            if (empty($cleanText)) {
                return;
            }

            $cacheDir = storage_path('app/public/voice_cache');
            if (! File::exists($cacheDir)) {
                @File::makeDirectory($cacheDir, 0777, true);
            }
            $cacheHash = md5($cleanText . '_' . $language . '_' . $voiceName);
            $cachedWavFile = $cacheDir . '/aoede_' . $cacheHash . '.wav';

            if (file_exists($cachedWavFile) && filesize($cachedWavFile) > 800) {
                return;
            }

            // Generate Gemini Aoede WAV directly if possible
            $voiceCtrl = app(\App\Http\Controllers\Api\VoiceAgentController::class);
            $wavBytes = $voiceCtrl->synthesizeGeminiVoiceWav($cleanText, $voiceName);
            if ($wavBytes !== null && strlen($wavBytes) > 800) {
                @file_put_contents($cachedWavFile, $wavBytes);
                return;
            }

            // Secondary neural fallback
            $cachedMp3File = $cacheDir . '/' . $cacheHash . '.mp3';
            $scriptPath = base_path('scripts/sneha_tts.py');
            if (file_exists($scriptPath) && ! file_exists($cachedMp3File)) {
                $cmd = sprintf(
                    'python3 %s %s %s %s > /dev/null 2>&1 &',
                    escapeshellarg($scriptPath),
                    escapeshellarg($cleanText),
                    escapeshellarg($cachedMp3File),
                    escapeshellarg($language)
                );
                @exec($cmd);
            }
        } catch (\Throwable $e) {}
    }

    private function userCacheKey(int $userId): string
    {
        return "active_ai_call_user_{$userId}";
    }
}
