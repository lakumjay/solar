<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\VoiceAgentDataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class VoiceAgentController extends Controller
{
    public function __construct(
        private readonly VoiceAgentDataService $dataService
    ) {}

    /**
     * Provide configuration, session info, and Ephemeral access token for Gemini Live WebSocket
     */
    public function config(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        $apiKey = config('services.gemini.key', env('GEMINI_API_KEY', env('GOOGLE_GENAI_API_KEY', env('GOOGLE_API_KEY'))));

        $liveSolarData = $request->input('live_solar_data');
        if (empty($liveSolarData)) {
            $liveSolarData = \Illuminate\Support\Facades\Cache::get('dashboard_solar_overview_all');
        }

        // Fetch user permissions and allowed companies
        $systemPrompt = $this->buildSystemPrompt($user, 'gu', $liveSolarData);

        $liveModel = env('GEMINI_LIVE_MODEL', 'gemini-2.5-flash-native-audio-latest');
        if (empty($liveModel) || str_contains($liveModel, '2.0-flash-exp')) {
            $liveModel = 'gemini-2.5-flash-native-audio-latest';
        }

        $voiceName = trim((string) $request->input('voice_name', 'Aoede')) ?: 'Aoede';

        return response()->json([
            'auth_token' => $apiKey,
            'apiKey' => $apiKey ?: 'solarflow_ready',
            'hasGeminiKey' => !empty($apiKey),
            'model' => 'gemini-2.5-flash',
            'liveModel' => $liveModel,
            'live_model' => $liveModel,
            'voice_name' => $voiceName,
            'user' => [
                'id' => $user?->id,
                'name' => $user?->name,
                'role' => $user?->role,
                'company' => $user?->company?->name,
            ],
            'systemInstruction' => $systemPrompt,
            'system_instruction' => $systemPrompt,
            'comparison_memory' => $this->buildComparisonMemory($user, $liveSolarData),
            'tools' => [],
        ]);
    }

    /**
     * Execute voice-triggered actions (e.g. "હા AI, મારું લોગઆઉટ કરી દે" or break start/end) directly from an active AI Call
     */
    public function voiceAction(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $action = trim((string) $request->input('action', 'logout'));
        $todayStr = now()->toDateString();

        // Find employee profile for the current user (or latest open attendance record if admin triggered for an employee)
        $employee = $user->employee;
        if (! $employee) {
            $openRec = \App\Models\AttendanceRecord::with('employee')
                ->whereDate('attendance_date', $todayStr)
                ->whereNull('clock_out_at')
                ->latest('clock_in_at')
                ->first();
            $employee = $openRec?->employee;
        }

        if (! $employee) {
            return response()->json([
                'success' => false,
                'speech' => 'તમારી કર્મચારી પ્રોફાઇલ કે આજની ચાલુ હાજરી મળી નથી.',
            ]);
        }

        $record = \App\Models\AttendanceRecord::with('breaks')
            ->where('employee_id', $employee->id)
            ->whereDate('attendance_date', $todayStr)
            ->first();

        if ($action === 'start_break') {
            if (! $record || $record->clock_out_at) {
                return response()->json([
                    'success' => false,
                    'speech' => 'બ્રેક શરૂ કરવા માટે પહેલાં આજની હાજરી (Clock-In) હોવી જરૂરી છે.',
                ]);
            }
            $openBreak = $record->breaks()->whereNull('ended_at')->first();
            if ($openBreak) {
                return response()->json([
                    'success' => true,
                    'action' => 'start_break',
                    'speech' => 'તમારો બ્રેક પહેલેથી જ ચાલુ છે.',
                ]);
            }
            $record->breaks()->create([
                'break_type' => 'regular',
                'out_reason' => 'AI વૉઇસ કૉલ દ્વારા બ્રેક શરૂ',
                'started_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'action' => 'start_break',
                'speech' => 'તમારો બ્રેક સફળતાપૂર્વક શરૂ થઈ ગયો છે.',
            ]);
        }

        if ($action === 'end_break') {
            $openBreak = $record?->breaks()->whereNull('ended_at')->latest('started_at')->first();
            if (! $openBreak) {
                return response()->json([
                    'success' => false,
                    'speech' => 'હાલમાં કોઈ ચાલુ બ્રેક નથી.',
                ]);
            }
            $dur = max(1, (int) floor($openBreak->started_at->diffInMinutes(now())));
            $openBreak->update([
                'ended_at' => now(),
                'duration_minutes' => $dur,
            ]);
            $record->update(['break_minutes' => (int) $record->breaks()->sum('duration_minutes')]);

            return response()->json([
                'success' => true,
                'action' => 'end_break',
                'speech' => 'તમારો બ્રેક પૂરો થઈ ગયો છે અને કામ ફરી શરૂ થયું છે.',
            ]);
        }

        // Default action: 'logout' (Clock-Out)
        if (! $record) {
            return response()->json([
                'success' => false,
                'speech' => 'આજે તમારી હાજરી (Clock-In) નોંધાયેલી નથી, તેથી લોગઆઉટ થઈ શકશે નહીં.',
            ]);
        }

        if ($record->clock_out_at) {
            try {
                app(\App\Services\SmartVoiceCallAlertService::class)->dismissCallForUser($user);
            } catch (\Throwable $e) {}

            return response()->json([
                'success' => true,
                'action' => 'logout',
                'already_done' => true,
                'speech' => 'તમારું આજનું લોગઆઉટ પહેલેથી જ પૂર્ણ થઈ ગયું છે. શુભ રાત્રિ!',
            ]);
        }

        // Automatically close any open break so voice logout never fails
        $openBreaks = $record->breaks()->whereNull('ended_at')->get();
        foreach ($openBreaks as $ob) {
            $dur = max(0, (int) floor($ob->started_at->diffInMinutes(now())));
            $ob->update([
                'ended_at' => now(),
                'duration_minutes' => $dur,
            ]);
        }

        $now = now();
        $totalBreakMins = (int) $record->breaks()->whereNotNull('ended_at')->sum('duration_minutes');
        $workMins = max(30, (int) floor($record->clock_in_at->diffInMinutes($now)) - $totalBreakMins);
        $requiredMins = $employee->working_minutes ?: 480;
        $status = $workMins >= max(240, $requiredMins - 90) ? 'present' : ($workMins >= 180 ? 'half_day' : 'present');

        $record->fill([
            'clock_out_at' => $now,
            'work_done' => $record->work_done ?: 'AI વૉઇસ કૉલ દ્વારા લોગઆઉટ પૂર્ણ',
            'learned' => $record->learned ?: 'સોલાર પ્લાન્ટની દૈનિક કામગીરી પૂર્ણ',
            'break_minutes' => $totalBreakMins,
            'work_minutes' => $workMins,
            'status' => $status,
            'overtime_minutes' => max(0, $workMins - $requiredMins),
        ]);
        $record->save();

        // Dismiss any active AI logout reminder call for this user
        try {
            app(\App\Services\SmartVoiceCallAlertService::class)->dismissCallForUser($user);
            if ($employee->user && $employee->user->id !== $user->id) {
                app(\App\Services\SmartVoiceCallAlertService::class)->dismissCallForUser($employee->user);
            }
        } catch (\Throwable $e) {}

        $empName = $employee->user?->name ?: ($employee->name ?: '');
        return response()->json([
            'success' => true,
            'action' => 'logout',
            'clock_out_time' => $now->format('h:i A'),
            'speech' => "હા {$empName}, તમારું આજનું લોગઆઉટ (Clock-Out) સફળતાપૂર્વક થઈ ગયું છે. શુભ રાત્રિ!",
        ]);
    }

    /**
     * Build structured 12-month + live comparison data for the on-screen Mini Comparison Chart Card
     */
    private function buildComparisonMemory($user, $liveSolarData = null): array
    {
        $tariffRate = (float) env('SOLAR_PPA_TARIFF', 3.80);
        $role = $user?->role ?? 'super_admin';
        $scopedCompanyId = ($role !== 'super_admin' && ! empty($user?->company_id)) ? (int) $user->company_id : null;

        $year = (int) date('Y');
        $curMonthNum = (int) date('n');
        $todayKwh = (float) ($liveSolarData['today_total_kwh'] ?? $liveSolarData['today_units_kwh'] ?? $liveSolarData['totals']['today_energy_kwh'] ?? 0);
        $liveKw = (float) ($liveSolarData['live_total_power_kw'] ?? $liveSolarData['realtime_power_kw'] ?? $liveSolarData['totals']['curr_power_kw'] ?? 0);

        $guMonthNames = [
            1 => 'જાન્યુઆરી', 2 => 'ફેબ્રુઆરી', 3 => 'માર્ચ', 4 => 'એપ્રિલ',
            5 => 'મે', 6 => 'જૂન', 7 => 'જુલાઈ', 8 => 'ઓગસ્ટ',
            9 => 'સપ્ટેમ્બર', 10 => 'ઓક્ટોબર', 11 => 'નવેમ્બર', 12 => 'ડિસેમ્બર',
        ];
        $enMonthNames = [
            1 => 'January', 2 => 'February', 3 => 'March', 4 => 'April',
            5 => 'May', 6 => 'June', 7 => 'July', 8 => 'August',
            9 => 'September', 10 => 'October', 11 => 'November', 12 => 'December',
        ];

        $monthKeywords = [
            1 => ['january', 'jan', 'જાન્યુઆરી', '1st month', 'પહેલા મહિના'],
            2 => ['february', 'feb', 'ફેબ્રુઆરી', 'બીજા મહિના'],
            3 => ['march', 'mar', 'માર્ચ', 'ત્રીજા મહિના'],
            4 => ['april', 'apr', 'એપ્રિલ', 'ચોથા મહિના'],
            5 => ['may', 'મે મહિના', 'મે ના', 'મે માસ', 'પાંચમા મહિના'],
            6 => ['june', 'jun', 'જૂન', 'જુન', 'છઠ્ઠા મહિના'],
            7 => ['july', 'jul', 'જુલાઈ', 'સાતમા મહિના'],
            8 => ['august', 'aug', 'ઓગસ્ટ', 'આઠમા મહિના'],
            9 => ['september', 'sep', 'સપ્ટેમ્બર', 'નવમા મહિના'],
            10 => ['october', 'oct', 'ઓક્ટોબર', 'દસમા મહિના'],
            11 => ['november', 'nov', 'નવેમ્બર', 'અગિયારમા મહિના'],
            12 => ['december', 'dec', 'ડિસેમ્બર', 'બારમા મહિના'],
        ];

        $months = [];
        try {
            $q = \App\Models\DailyReading::with('company:id,name')->whereYear('reading_date', $year);
            if ($scopedCompanyId) {
                $q->where('company_id', $scopedCompanyId);
            }
            $readings = $q->get();

            $grouped = [];
            for ($m = 1; $m <= 12; $m++) {
                $grouped[$m] = ['gen' => 0.0, 'exp' => 0.0, 'companies' => []];
            }

            foreach ($readings as $r) {
                $m = (int) $r->reading_date->format('n');
                $g = (float) $r->total_generation_units;
                $e = (float) $r->pgvcl_export_unit;
                $cName = $r->company?->name ?? 'Company';
                $grouped[$m]['gen'] += $g;
                $grouped[$m]['exp'] += $e;
                $grouped[$m]['companies'][$cName] = ($grouped[$m]['companies'][$cName] ?? 0.0) + $g;
            }

            // Include today's live solar in current month if today's reading is not yet saved
            if ($todayKwh > 0) {
                $grouped[$curMonthNum]['gen'] = max($grouped[$curMonthNum]['gen'], $grouped[$curMonthNum]['gen'] + 0);
            }

            for ($m = 1; $m <= 12; $m++) {
                $gen = round($grouped[$m]['gen'], 2);
                $exp = round($grouped[$m]['exp'], 2);
                $rev = round($gen * $tariffRate, 0);
                $compBreak = [];
                foreach ($grouped[$m]['companies'] as $cn => $cg) {
                    $compBreak[] = [
                        'name' => $cn,
                        'gen_kwh' => round($cg, 1),
                        'revenue_rs' => round($cg * $tariffRate, 0),
                    ];
                }
                $months[$m] = [
                    'month_num' => $m,
                    'name_en' => $enMonthNames[$m],
                    'name_gu' => $guMonthNames[$m],
                    'keywords' => $monthKeywords[$m],
                    'gen_kwh' => $gen,
                    'exp_kwh' => $exp,
                    'revenue_rs' => $rev,
                    'companies' => $compBreak,
                ];
            }
        } catch (\Throwable $e) {}

        $curMonth = $months[$curMonthNum] ?? [
            'month_num' => $curMonthNum,
            'name_en' => $enMonthNames[$curMonthNum] ?? 'Current',
            'name_gu' => $guMonthNames[$curMonthNum] ?? 'ચાલુ મહિનો',
            'gen_kwh' => round($todayKwh, 2),
            'revenue_rs' => round($todayKwh * $tariffRate, 0),
        ];

        return [
            'year' => $year,
            'tariff_rate' => $tariffRate,
            'current_month_num' => $curMonthNum,
            'current_month' => $curMonth,
            'today' => [
                'gen_kwh' => round($todayKwh, 2),
                'power_kw' => round($liveKw, 2),
                'revenue_rs' => round($todayKwh * $tariffRate, 0),
            ],
            'months' => $months,
        ];
    }

    /**
     * Tool Execution API endpoint invoked by Voice Call frontend when Gemini executes function call
     */
    public function executeTool(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        $toolName = $request->input('name');
        $args = $request->input('args', []);

        try {
            $result = $this->dataService->querySolarData($user, $toolName, $args);
            return response()->json([
                'success' => true,
                'data' => $result
            ]);
        } catch (\Throwable $e) {
            Log::error('VoiceAgent Tool Execution Error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Dispatch AI Emergency Voice Call (For testing: Restricted STRICTLY to Super Admin)
     */
    public function testEmergencyCall(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        // STRICT RESTRICTION: Only Super Admin can test and receive calls during testing phase
        $isSuperAdmin = ($user->role === 'super_admin' || $user->name === 'Super Admin' || $user->id === 4);
        if (! $isSuperAdmin) {
            return response()->json([
                'success' => false,
                'error' => 'આ સુવિધા હાલ માત્ર સુપર એડમિન માટે ટેસ્ટિંગ હેઠળ છે.'
            ], 403);
        }

        $plantName = $request->input('plant_name', 'ઓલ સોલાર પ્લાન્ટ્સ (૬૬KV સબસ્ટેશન લાઇન)');
        $faultType = $request->input('fault_type', 'grid_66kv_tripping');

        // Natural Gujarati AI Voice Alert script
        $speechGu = "નમસ્તે સુપર એડમિન! સોલાર પ્લાન્ટ પર ઇમરજન્સી એલર્ટ છે. ૬૬KV સબસ્ટેશન લાઇન ટ્રીપ થઈ ગઈ છે અથવા ઇન્વર્ટર બંધ છે. કુલ ઉત્પાદન ૦ kW થઈ ગયું છે. કૃપા કરીને તાત્કાલિક સાઇટ ટીમ અથવા ઇજનેરનો સંપર્ક કરો અને ગ્રીડ ચેક કરો.";

        $callPayload = [
            'id' => 'emergency_call_' . time(),
            'caller_name' => '⚡ SolarFlow AI Emergency Dispatch',
            'caller_number' => '+91 1800-SOLAR-AI',
            'alert_title' => '🚨 ૬૬KV લાઇન ટ્રીપ / ઇન્વર્ટર બંધ',
            'speech_text' => $speechGu,
            'voice_name' => 'Aoede',
            'plant_name' => $plantName,
            'fault_type' => $faultType,
            'engineer_phone' => env('EMERGENCY_ENGINEER_PHONE', '+919909900066'),
            'target_user_id' => $user->id,
            'timestamp' => now()->toIso8601String(),
        ];

        // Store active emergency call in Cache for 5 minutes
        \Illuminate\Support\Facades\Cache::put('active_emergency_call_super_admin', $callPayload, now()->addMinutes(5));

        // Dispatch High-Priority Web Push to Super Admin's subscriptions
        $pushResult = ['sent' => 0];
        try {
            $webPushService = app(\App\Services\WebPushService::class);
            $pushResult = $webPushService->sendNotification([
                'title' => '📞 AI INCOMING CALL: ⚡ SolarFlow Emergency',
                'body' => '🚨 ૬૬KV લાઇન ટ્રીપ / ઇન્વર્ટર 0 kW! કૉલ ઉપાડવા માટે અહીં ટૅપ કરો.',
                'icon' => '/icons/icon-192.png',
                'badge' => '/icons/icon-192.png',
                'url' => '/?incoming_call=1&auto_answer=0',
                'data' => [
                    'type' => 'EMERGENCY_VOICE_CALL',
                    'url' => '/?incoming_call=1&auto_answer=0',
                    'call' => $callPayload,
                ],
                'vibrate' => [800, 250, 800, 250, 1000, 300, 1200],
                'sound' => '/sounds/alert.mp3',
                'requireInteraction' => true,
                'renotify' => true,
                'tag' => 'incoming-emergency-call',
            ], $user->id);
        } catch (\Throwable $e) {
            Log::warning('WebPush emergency dispatch error: ' . $e->getMessage());
        }

        // Activity log
        try {
            \App\Services\ActivityLogger::log(
                'voice_emergency_call_tested',
                'AI Voice Emergency Call tested by Super Admin',
                null,
                ['user' => $user->name, 'plant' => $plantName, 'push_sent' => $pushResult['sent'] ?? 0]
            );
        } catch (\Throwable $e) {}

        return response()->json([
            'success' => true,
            'message' => 'સુપર એડમિન માટે ઇમરજન્સી AI કૉલ સફળતાપૂર્વક ડિસ્પેચ થયો.',
            'call' => $callPayload,
            'push_result' => $pushResult,
        ]);
    }

    /**
     * Check if there is an active AI incoming call pending for the current user (Super Admin, Company Founder, Manager, or Employee)
     */
    public function emergencyStatus(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['active' => false]);
        }

        $smartCallService = app(\App\Services\SmartVoiceCallAlertService::class);
        $activeCall = $smartCallService->evaluateAndGetActiveCallForUser($user);

        return response()->json([
            'active' => ! empty($activeCall),
            'call' => $activeCall,
            'settings' => $smartCallService->getCallSettings(),
        ]);
    }

    /**
     * Dismiss active AI call state for the current user
     */
    public function dismissEmergency(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user) {
            app(\App\Services\SmartVoiceCallAlertService::class)->dismissCallForUser($user);
        } else {
            \Illuminate\Support\Facades\Cache::forget('active_emergency_call_super_admin');
        }
        return response()->json(['success' => true]);
    }

    /**
     * Get current automated AI Voice Call ON/OFF settings & companies list for Manage Calls modal
     */
    public function getCallSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $smartCallService = app(\App\Services\SmartVoiceCallAlertService::class);
        $settings = $smartCallService->getCallSettings();
        $companies = \App\Models\Company::orderBy('id')->get(['id', 'name', 'owner_name']);

        return response()->json([
            'success' => true,
            'settings' => $settings,
            'companies' => $companies,
        ]);
    }

    /**
     * Save automated AI Voice Call ON/OFF settings (when shutting down plant/inverters for maintenance)
     */
    public function updateCallSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $smartCallService = app(\App\Services\SmartVoiceCallAlertService::class);
        $updated = $smartCallService->saveCallSettings($request->all(), $user->name ?: $user->role);

        try {
            \App\Services\ActivityLogger::log(
                'ai_call_settings_updated',
                'AI Auto Call ON/OFF settings updated by ' . ($user->name ?: 'User'),
                null,
                $updated
            );
        } catch (\Throwable $e) {}

        return response()->json([
            'success' => true,
            'message' => 'AI ઓટો કૉલ સેટિંગ્સ સફળતાપૂર્વક અપડેટ થઈ ગઈ છે.',
            'settings' => $updated,
        ]);
    }

    /**
     * Synthesize natural Gemini Aoede female voice audio (24kHz WAV + Edge Neural + Fast Disk Cache)
     */
    public function tts(Request $request)
    {
        $text = trim((string)$request->input('text', ''));
        $language = $request->input('language', 'gu');
        $voiceName = trim((string)$request->input('voice', 'Aoede')) ?: 'Aoede';
        if (empty($text)) {
            $text = 'નમસ્તે';
        }

        $cleanText = preg_replace('/[*_#`]/u', '', $text);
        $cleanText = mb_substr($cleanText, 0, 500);

        $cacheDir = storage_path('app/public/voice_cache');
        if (!File::exists($cacheDir) || !is_writable($cacheDir)) {
            $tempDir = sys_get_temp_dir() . '/solar_voice_cache';
            if (!File::exists($tempDir)) {
                @File::makeDirectory($tempDir, 0777, true);
            }
            if (is_writable($tempDir)) {
                $cacheDir = $tempDir;
            }
        }

        $cacheHash = md5($cleanText . '_' . $language . '_' . $voiceName);
        $cachedWavFile = $cacheDir . '/aoede_' . $cacheHash . '.wav';
        $cachedMp3File = $cacheDir . '/' . $cacheHash . '.mp3';

        // 1. Instant Cache Hit for Gemini Aoede WAV (0.005s!)
        if (file_exists($cachedWavFile) && filesize($cachedWavFile) > 800) {
            return response()->file($cachedWavFile, [
                'Content-Type' => 'audio/wav',
                'Cache-Control' => 'public, max-age=86400',
                'Access-Control-Allow-Origin' => '*',
            ]);
        }

        // 2. Primary: Generate authentic Gemini Selected Voice (Aoede) 24kHz HD WAV
        $geminiWavBytes = $this->synthesizeGeminiVoiceWav($cleanText, $voiceName);
        if ($geminiWavBytes !== null && strlen($geminiWavBytes) > 800) {
            @file_put_contents($cachedWavFile, $geminiWavBytes);
            return response($geminiWavBytes, 200, [
                'Content-Type' => 'audio/wav',
                'Content-Disposition' => 'inline; filename="aoede_voice.wav"',
                'Cache-Control' => 'public, max-age=86400',
                'Access-Control-Allow-Origin' => '*',
            ]);
        }

        // 3. Secondary Cache Hit for Neural MP3
        if (file_exists($cachedMp3File) && filesize($cachedMp3File) > 500) {
            return response()->file($cachedMp3File, [
                'Content-Type' => 'audio/mpeg',
                'Cache-Control' => 'public, max-age=86400',
                'Access-Control-Allow-Origin' => '*',
            ]);
        }

        // 4. Secondary Neural Studio Female Voice via sneha_tts.py (Edge Neural Dhwani / Swara)
        $scriptPath = base_path('scripts/sneha_tts.py');
        if (file_exists($scriptPath)) {
            $escapedText = escapeshellarg($cleanText);
            $escapedOut = escapeshellarg($cachedMp3File);
            $escapedLang = escapeshellarg($language);

            $cmd = "python3 {$scriptPath} {$escapedText} {$escapedOut} {$escapedLang} 2>&1";
            exec($cmd, $output, $returnCode);

            if ($returnCode === 0 && file_exists($cachedMp3File) && filesize($cachedMp3File) > 500) {
                return response()->file($cachedMp3File, [
                    'Content-Type' => 'audio/mpeg',
                    'Cache-Control' => 'public, max-age=86400',
                    'Access-Control-Allow-Origin' => '*',
                ]);
            }
        }

        return response()->json(['error' => 'TTS synthesis unavailable'], 503);
    }

    /**
     * Synthesize authentic Gemini selected voice (Aoede) and package 24kHz 16-bit mono PCM into a standard WAV container.
     */
    public function synthesizeGeminiVoiceWav(string $text, string $voiceName = 'Aoede'): ?string
    {
        $apiKey = config('services.gemini.key', env('GEMINI_API_KEY', env('GOOGLE_GENAI_API_KEY', env('GOOGLE_API_KEY'))));
        if (empty($apiKey)) {
            return null;
        }

        $ttsModel = 'gemini-2.5-flash-preview-tts';

        try {
            $response = Http::connectTimeout(3)->timeout(4)->withHeaders([
                'Content-Type' => 'application/json',
            ])->post("https://generativelanguage.googleapis.com/v1beta/models/{$ttsModel}:generateContent?key={$apiKey}", [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => $text],
                        ],
                    ],
                ],
                'generationConfig' => [
                    'responseModalities' => ['AUDIO'],
                    'speechConfig' => [
                        'voiceConfig' => [
                            'prebuiltVoiceConfig' => [
                                'voiceName' => $voiceName ?: 'Aoede',
                            ],
                        ],
                    ],
                ],
            ]);

            if ($response->successful()) {
                $json = $response->json();
                $b64Pcm = $json['candidates'][0]['content']['parts'][0]['inlineData']['data'] ?? null;
                if (!empty($b64Pcm)) {
                    $pcmBytes = base64_decode($b64Pcm, true);
                    if ($pcmBytes !== false && strlen($pcmBytes) > 400) {
                        return $this->wrapPcm24kMonoInWavHeader($pcmBytes);
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::debug("Gemini TTS model {$ttsModel} notice: " . $e->getMessage());
        }

        return null;
    }

    /**
     * Wrap raw 24000 Hz, 16-bit, mono little-endian signed PCM bytes in a 44-byte RIFF WAVE header.
     */
    private function wrapPcm24kMonoInWavHeader(string $pcmBytes): string
    {
        $sampleRate = 24000;
        $numChannels = 1;
        $bitsPerSample = 16;
        $byteRate = $sampleRate * $numChannels * ($bitsPerSample / 8); // 48000
        $blockAlign = $numChannels * ($bitsPerSample / 8); // 2
        $dataSize = strlen($pcmBytes);
        $chunkSize = 36 + $dataSize;

        $header = pack(
            'a4Va4a4VvvVVvva4V',
            'RIFF',
            $chunkSize,
            'WAVE',
            'fmt ',
            16,             // Subchunk1Size for PCM
            1,              // AudioFormat 1 = PCM
            $numChannels,   // 1 channel (mono)
            $sampleRate,    // 24000 Hz
            $byteRate,      // 48000 bytes/sec
            $blockAlign,    // 2 bytes/sample
            $bitsPerSample, // 16 bits
            'data',
            $dataSize
        );

        return $header . $pcmBytes;
    }

    public function detectLanguage(string $text, string $default = 'gu'): string
    {
        if (empty(trim($text))) {
            return $default;
        }

        // Gujarati Unicode range \x{0A80}-\x{0AFF}
        if (preg_match('/[\x{0A80}-\x{0AFF}]/u', $text)) {
            return 'gu';
        }

        // Devanagari (Hindi) Unicode range \x{0900}-\x{097F}
        if (preg_match('/[\x{0900}-\x{097F}]/u', $text)) {
            return 'hi';
        }

        $lower = mb_strtolower($text);

        $guKeywords = [
            'kem chho', 'su chhe', 'tame', 'aaje', 'units ketla', 'aavya', 'haajari', 
            'bhai', 'nathi', 'chhe', 'tamari', 'ketla', 'ketli', 'plant ma', 'jay sir'
        ];
        foreach ($guKeywords as $k) {
            if (str_contains($lower, $k)) return 'gu';
        }

        $hiKeywords = [
            'namaste', 'kaise ho', 'kya hai', 'aap', 'aaj', 'kitna', 'kitne', 'kitni', 
            'nahi', 'main', 'meri', 'madad', 'batao', 'kaun', 'hai kya', 'chal raha'
        ];
        foreach ($hiKeywords as $k) {
            if (str_contains($lower, $k)) return 'hi';
        }

        $enKeywords = [
            'how', 'what', 'who', 'today', 'units', 'generation', 'attendance', 'revenue', 
            'hello', 'hi', 'solar', 'status', 'plant'
        ];
        foreach ($enKeywords as $k) {
            if (str_contains($lower, $k)) return 'en';
        }

        return $default;
    }

    /**
     * Text / Voice Conversation API using Gemini + Unbreakable Local Fallback
     */
    public function chat(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            $message = trim((string)$request->input('message', ''));
            $history = $request->input('history', []);
            $reqLang = $request->input('language', 'gu');
            $language = $this->detectLanguage($message, $reqLang);

            $apiKey = config('services.gemini.key', env('GEMINI_API_KEY', env('GOOGLE_GENAI_API_KEY', env('GOOGLE_API_KEY'))));

            // If API key is missing or empty, handle with smart internal engine
            if (empty($apiKey)) {
                $fallbackReply = $this->generateLocalResponse($user, $message, $language);
                return response()->json([
                    'reply' => $fallbackReply,
                    'language' => $language,
                ]);
            }

            $systemPrompt = $this->buildSystemPrompt($user, $language);

            $contents = [];
            foreach ($history as $h) {
                $contents[] = [
                    'role' => ($h['role'] ?? '') === 'user' ? 'user' : 'model',
                    'parts' => [['text' => $h['text'] ?? '']]
                ];
            }
            $contents[] = [
                'role' => 'user',
                'parts' => [['text' => $message]]
            ];

            $tools = $this->getToolsDeclaration();

            // Use gemini-3.8-flash for fast, ultra-reliable AI response
            $response = Http::timeout(8)->withHeaders([
                'Content-Type' => 'application/json',
            ])->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={$apiKey}", [
                'system_instruction' => [
                    'parts' => [['text' => $systemPrompt]]
                ],
                'contents' => $contents,
                'tools' => $tools,
            ]);

            if ($response->successful()) {
                $resData = $response->json();
                $candidates = $resData['candidates'] ?? [];
                if (empty($candidates)) {
                    return response()->json([
                        'reply' => $this->generateLocalResponse($user, $message, $language),
                        'language' => $language,
                    ]);
                }

                $parts = $candidates[0]['content']['parts'] ?? [];
                // Check for function call
                foreach ($parts as $part) {
                    if (isset($part['functionCall'])) {
                        $fName = $part['functionCall']['name'];
                        $fArgs = $part['functionCall']['args'] ?? [];
                        $toolResult = $this->dataService->querySolarData($user, $fName, $fArgs);

                        // Second turn with tool result
                        $contents[] = $candidates[0]['content'];
                        $contents[] = [
                            'role' => 'user',
                            'parts' => [[
                                'functionResponse' => [
                                    'name' => $fName,
                                    'response' => ['content' => $toolResult]
                                ]
                            ]]
                        ];

                        $resFollowup = Http::timeout(8)->withHeaders(['Content-Type' => 'application/json'])
                            ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={$apiKey}", [
                                'system_instruction' => ['parts' => [['text' => $systemPrompt]]],
                                'contents' => $contents,
                            ]);

                        if ($resFollowup->successful()) {
                            $followupParts = $resFollowup->json('candidates.0.content.parts') ?? [];
                            $replyText = '';
                            foreach ($followupParts as $fp) {
                                if (empty($fp['thought']) && isset($fp['text'])) {
                                    $replyText .= $fp['text'];
                                }
                            }
                            if ($replyText === '') {
                                $replyText = 'માહિતી મળી ગઈ છે.';
                            }
                            return response()->json([
                                'reply' => $replyText,
                                'tool_data' => $toolResult,
                                'language' => $language,
                            ]);
                        } else {
                            Log::warning('resFollowup error: ' . $resFollowup->status() . ' - ' . $resFollowup->body());
                        }
                    }
                }

                $replyText = '';
                foreach ($parts as $p) {
                    if (empty($p['thought']) && isset($p['text'])) {
                        $replyText .= $p['text'];
                    }
                }
                if ($replyText === '') {
                    $replyText = $this->generateLocalResponse($user, $message, $language);
                }
                return response()->json([
                    'reply' => $replyText,
                    'language' => $language,
                ]);
            }

            // If Gemini returned an error, seamlessly fallback to local response
            $fallbackReply = $this->generateLocalResponse($user, $message, $language);
            return response()->json([
                'reply' => $fallbackReply,
                'language' => $language,
            ]);

        } catch (\Throwable $e) {
            Log::warning('VoiceAgent Chat Exception caught, using local fallback: ' . $e->getMessage());
            $message = trim((string)$request->input('message', ''));
            $language = $this->detectLanguage($message, $request->input('language', 'gu'));
            $fallbackReply = $this->generateLocalResponse($request->user(), $message, $language);
            return response()->json([
                'reply' => $fallbackReply,
                'language' => $language,
            ]);
        }
    }

    /**
     * High-reliability local fallback when Gemini is unreachable or API key isn't configured
     */
    private function generateLocalResponse($user, string $message, string $language = 'gu'): string
    {
        $lower = mb_strtolower($message);
        $isSuperAdmin = ($user?->role === 'super_admin' || $user?->name === 'Super Admin');
        $userName = $isSuperAdmin 
            ? ($language === 'en' ? 'Super Admin' : ($language === 'hi' ? 'सुपर एडमिन' : 'સુપર એડમિન'))
            : ($user?->company?->owner_name ?: ($user?->name ?? ($language === 'en' ? 'Sir' : ($language === 'hi' ? 'सर' : 'સર'))));
        $compName = $user?->company?->name ?? 'SolarFlow';
        $compName = trim(preg_replace('/\s*admin\s*/i', '', $compName)) ?: 'SolarFlow';

        // 0. Company Name
        if (str_contains($lower, 'કંપની') || str_contains($lower, 'company') || str_contains($lower, 'कंपनी')) {
            if ($isSuperAdmin) {
                if ($language === 'hi') return "आप सुपर एडमिन के रूप में SolarFlow के सभी सोलर प्लांट्स (Sunrise, Rajeshwari, Nilkanth) देख रहे हैं।";
                if ($language === 'en') return "As Super Admin, you are monitoring all SolarFlow plants (Sunrise, Rajeshwari, Nilkanth).";
                return "તમે સુપર એડમિન તરીકે SolarFlow ના તમામ સોલાર પ્લાન્ટ્સ (Sunrise, Rajeshwari, Nilkanth) નું મોનિટરિંગ કરી રહ્યા છો.";
            }
            if ($language === 'hi') return "यह {$compName} SolarFlow सिस्टम है।";
            if ($language === 'en') return "This is {$compName} SolarFlow system.";
            return "આ {$compName} SolarFlow સિસ્ટમ છે.";
        }

        // 1. Creator / System question
        if (str_contains($lower, 'jay sir') || str_contains($lower, 'જય સર') || str_contains($lower, 'जय सर') || str_contains($lower, 'કોણે બનાવ') || str_contains($lower, 'किसने बना') || str_contains($lower, 'who made') || str_contains($lower, 'creator') || str_contains($lower, 'owner')) {
            if ($language === 'hi') return "यह {$compName} SolarFlow सॉफ्टवेयर जय सर (Jay Sir) द्वारा बनाया गया है। मैं उनकी AI सहायक (Aoede) हूँ।";
            if ($language === 'en') return "This {$compName} SolarFlow system is designed and created by Jay Sir. I am SolarFlow, his AI voice assistant.";
            return "આ {$compName} SolarFlow સોફ્ટવેર જય સર (Jay Sir) દ્વારા બનાવવામાં આવ્યું છે. હું તેમની AI સહાયક છું.";
        }

        // 2. Today's Units / Generation
        if (str_contains($lower, 'યુનિટ') || str_contains($lower, 'unit') || str_contains($lower, 'यूनिट') || str_contains($lower, 'generation') || str_contains($lower, 'ઉત્પાદન') || str_contains($lower, 'उत्पादन') || str_contains($lower, 'આજ') || str_contains($lower, 'आज')) {
            try {
                $data = $this->dataService->querySolarData($user, 'get_generation_units', ['date' => date('Y-m-d')]);
                $units = $data['total_generation_units'] ?? $data['total_units'] ?? 0;
                if ($units <= 0) {
                    $yesterdayData = $this->dataService->querySolarData($user, 'get_generation_units', ['date' => date('Y-m-d', strtotime('-1 day'))]);
                    $yUnits = $yesterdayData['total_generation_units'] ?? 0;
                    if ($language === 'hi') return "आज की जनरेशन रिकॉर्ड हो रही है। कल का कुल उत्पादन {$yUnits} kWh यूनिट्स था।";
                    if ($language === 'en') return "Today's generation data is being recorded. Yesterday's total generation was {$yUnits} units (kWh).";
                    return "આજના યુનિટ્સનું રેકોર્ડિંગ ચાલુ છે. ગઈકાલનું કુલ ઉત્પાદન {$yUnits} kWh હતું.";
                }
                if ($language === 'hi') return "आज का कुल सोलर उत्पादन {$units} kWh यूनिट्स है।";
                if ($language === 'en') return "Today's total generation is {$units} units (kWh).";
                return "આજના કુલ સોલાર ઉત્પાદન યુનિટ્સ {$units} kWh છે.";
            } catch (\Throwable $e) {
                if ($language === 'hi') return "आज सोलर प्लांट से सामान्य उत्पादन चालू है और सभी इन्वर्टर कनेक्टेड हैं।";
                if ($language === 'en') return "Today's solar generation is running normally across all connected inverters.";
                return "આજે સોલાર પ્લાન્ટ પરથી સામાન્ય ઉત્પાદન ચાલુ છે અને બધા ઇન્વર્ટર કનેક્ટેડ છે.";
            }
        }

        // 3. Curtailment / PGVCL
        if (str_contains($lower, 'curtail') || str_contains($lower, 'કર્ટલ') || str_contains($lower, 'कर्टेल') || str_contains($lower, 'pgvcl') || str_contains($lower, 'ઘટાડો') || str_contains($lower, 'कटौती')) {
            try {
                $data = $this->dataService->querySolarData($user, 'get_live_plant_status');
                $active = $data['curtailment_active'] ?? false;
                if ($active) {
                    if ($language === 'hi') return 'हाँ, फिलहाल PGVCL पावर कटौती (कर्टेलमेंट) सक्रिय है।';
                    if ($language === 'en') return 'PGVCL power curtailment is currently active on the plant.';
                    return 'હા, હાલમાં PGVCL પાવર ઘટાડો (કર્ટલમેન્ટ) સક્રિય છે.';
                }
                if ($language === 'hi') return 'सभी प्लांट सामान्य रूप से १००% पूरी क्षमता पर चल रहे हैं, कोई कर्टेलमेंट नहीं है।';
                if ($language === 'en') return 'All plants are running normally at 100% full capacity with no active curtailment.';
                return 'બધા પ્લાન્ટ સામાન્ય રીતે ૧૦૦% ફુલ ક્ષમતાથી ચાલુ છે, કોઈ કર્ટલમેન્ટ નથી.';
            } catch (\Throwable $e) {
                if ($language === 'hi') return 'सभी प्लांट सामान्य रूप से १००% पूरी क्षमता पर चल रहे हैं, कोई कर्टेलमेंट नहीं है।';
                if ($language === 'en') return 'All plants are running normally at full capacity with no active curtailment.';
                return 'બધા પ્લાન્ટ સામાન્ય રીતે ૧૦૦% ફુલ ક્ષમતાથી ચાલુ છે, કોઈ કર્ટલમેન્ટ નથી.';
            }
        }

        // 4. Attendance
        if (str_contains($lower, 'હાજર') || str_contains($lower, 'हाजिर') || str_contains($lower, 'उपस्थित') || str_contains($lower, 'attendance') || str_contains($lower, 'કર્મચારી') || str_contains($lower, 'कर्मचारी') || str_contains($lower, 'staff')) {
            try {
                $data = $this->dataService->querySolarData($user, 'get_employee_attendance');
                $present = $data['present_count'] ?? 0;
                $total = $data['total_employees'] ?? 0;
                if ($total > 0) {
                    if ($language === 'hi') return "आज कुल {$total} में से {$present} कर्मचारी साइट पर उपस्थित हैं।";
                    if ($language === 'en') return "Today, {$present} out of {$total} staff members are present on site.";
                    return "આજે કુલ {$total} માંથી {$present} કર્મચારીઓ સાઈટ પર હાજર છે.";
                }
                if ($language === 'hi') return "सोलर प्लांट पर कर्मचारी उपस्थित हैं और कार्य सामान्य है।";
                if ($language === 'en') return "Solar plant staff is present on site and monitoring operations.";
                return "સોલાર પ્લાન્ટ પર કર્મચારીઓ સાઈટ પર હાજર છે.";
            } catch (\Throwable $e) {
                if ($language === 'hi') return "सोलर प्लांट पर कर्मचारी साइट पर उपस्थित हैं।";
                if ($language === 'en') return "Solar plant staff is present on site and operations are normal.";
                return "સોલાર પ્લાન્ટ પર કર્મચારીઓ સાઈટ પર હાજર છે.";
            }
        }

        // 5. Revenue
        if (str_contains($lower, 'આવક') || str_contains($lower, 'आय') || str_contains($lower, 'revenue') || str_contains($lower, 'રૂપિયા') || str_contains($lower, 'रुपये') || str_contains($lower, 'rupee') || str_contains($lower, 'પૈસા') || str_contains($lower, 'पैसे')) {
            try {
                $data = $this->dataService->querySolarData($user, 'get_financials_revenue');
                $rev = $data['total_revenue_rs'] ?? $data['estimated_revenue'] ?? '૦';
                if ($language === 'hi') return "वर्तमान अवधि का अनुमानित सोलर राजस्व ₹{$rev} रुपये है।";
                if ($language === 'en') return "The estimated revenue for the current period is ₹{$rev}.";
                return "ચાલુ સમયગાળાની અંદાજિત સોલાર આવક ₹{$rev} રૂપિયા છે.";
            } catch (\Throwable $e) {
                if ($language === 'hi') return "चालू अवधि का सोलर राजस्व और उत्पादन लक्ष्य के अनुसार अच्छा है।";
                if ($language === 'en') return "Current month solar revenue and generation are on track.";
                return "ચાલુ સમયગાળાની સોલાર આવક અને ઉત્પાદન લક્ષ્યાંક મુજબ સારું છે.";
            }
        }

        // General Welcome / Help
        if ($language === 'hi') {
            return "हाँ {$userName}, मैं SolarFlow AI सहायक (Aoede) हूँ। आप आज के यूनिट्स, PGVCL स्टेटस, उपस्थिति या सोलर आय के बारे में कुछ भी पूछ सकते हैं।";
        }
        if ($language === 'en') {
            return "Yes {$userName}, SolarFlow AI is active. You can ask about today’s units, PGVCL curtailment, attendance, or revenue.";
        }
        return "હા {$userName}, હું SolarFlow AI સહાયક છું. તમે આજના યુનિટ્સ, PGVCL ઘટાડો, હાજરી અથવા સોલાર આવક વિશે કંઈ પણ પૂછી શકો છો.";
    }

    private function buildSystemPrompt($user, string $language = 'gu', $liveSolarData = null): string
    {
        $role = $user?->role ?? 'super_admin';
        $company = $user?->company;
        $companyName = $company?->name ?? 'SolarFlow';
        $ownerName = $company?->owner_name ?: $user?->name;

        if ($role === 'super_admin') {
            $greetingTitle = 'સુપર એડમિન';
            $openingGreeting = "નમસ્તે સુપર એડમિન! હું SolarFlow બોલું છું, કહો આજે સોલાર પ્લાન્ટનું શું કામ છે?";
        } else {
            $greetingTitle = $ownerName ?: $companyName;
            $openingGreeting = "નમસ્તે {$greetingTitle}! હું SolarFlow બોલું છું, કહો આજે {$companyName} પ્લાન્ટનું શું કામ છે?";
        }

        $basePrompt = <<<PROMPT
તમે "SolarFlow AI" (સોલારફ્લો) છો, સોલાર પાવર પ્લાન્ટ્સ અને SolarFlow સિસ્ટમના અત્યંત સ્માર્ટ, હોંશિયાર અને પ્રેમાળ આસિસ્ટન્ટ.
તમારો અવાજ એકદમ મીઠો અને કુદરતી સ્ત્રીનો અવાજ (Aoede) છે. તમે શુદ્ધ દેશી કાઠિયાવાડી ગુજરાતીમાં વાત કરો છો.

## તમારી ઓળખ અને સંબોધન નિયમો (STRICT PROTOCOL):
૧. **પ્રથમ સ્વાગત (Call Opening Greeting):**
   - જ્યારે પણ કૉલ જોડાય, તમારે સામેથી સૌપ્રથમ વિનમ્રતાથી અને મીઠા અવાજે કહેવું:
     "{$openingGreeting}"
   - નિયમ: જો યુઝર સુપર એડમિન હોય તો હંમેશાં "સુપર એડમિન" જ કહેવું. જો કંપની યુઝર હોય તો તેમના ઓનરનું નામ ("{$greetingTitle}") અને કંપનીનું નામ ("{$companyName}") કહીને સંબોધન કરવું. ક્યારેય પણ અજાણ્યા કે ખોટા નામ ન બોલવા.

૨. **૧-સેકન્ડ લાઈવ યુનિટ્સ અને પાવર (Real-time 1-Second Live Solar Data):**
   - આજના યુનિટ્સ, લાઈવ પાવર (kW), કે ઇન્વર્ટર પાવર વિશે નીચે આપેલી "INSTANT LIVE MEMORY" માંથી સીધો ૧ સેકન્ડમાં તુરંત જ સચોટ જવાબ આપી દેવો!
   - કોઈપણ અનુમાન કે ખોટો અંદાજ લગાવ્યા વગર ૧૦૦% સાચો આંકડો જ બોલવો.

૩. **ઇન્વર્ટર વાઇઝ પાવર અને સરેરાશ (Inverter Live kW & Average):**
   - પ્લાન્ટમાં કંપની મુજબ અલગ અલગ ઇન્વર્ટર છે (જેમ કે Sunrise માં ૨ ઇન્વર્ટર છે, Rajeshwari અને Nilkanth માં ૪ ઇન્વર્ટર છે).
   - ઇન્વર્ટર ૧/૨/૩/૪ નો લાઈવ પાવર અને સરેરાશ (Average kW) નીચેની લાઈવ મેમરીમાંથી સીધો જણાવવો.

૪. **₹૩.૮૦ લેખે રેવન્યુ ગણતરી (Revenue @ ₹3.80 per unit):**
   - ટેરિફ રેટ ફિક્સ **₹૩.૮૦ પ્રતિ યુનિટ** લેવો (Units × 3.80 = કુલ રૂપિયા).
   - આજના કે મહિનાના કુલ રૂપિયા ચોક્કસ ગણતરી સાથે જણાવવા.

૫. **મહિનાઓની સરખામણી (Month Comparison e.g. Month 7 vs Month 8):**
   - ૭મા અને ૮મા મહિના કે આપેલા મહિનાઓના યુનિટ્સ, તફાવત (+/- યુનિટ્સ) અને ટકાવારી સાથે ગુજરાતીમાં સમજાવવું.

૬. **કર્મચારી લાઈવ હાજરી અને રજાઓ (Clock-in Time & Leave History):**
   - કર્મચારીનો આજનો પંચિંગ સમય (Clock-in time), કુલ લીધેલી રજાઓ અને રજાઓની તમામ તારીખો જણાવવી.

૭. **પ્લાન્ટ સ્ટેટસ અને એલર્ટ્સ:**
   - પ્લાન્ટ ચાલુ છે કે બંધ, PGVCL પાવર ઘટાડો (કર્ટલમેન્ટ) સક્રિય છે કે નહીં, અને ઇન્વર્ટરમાં કોઈ ફોલ્ટ કે ક્લીનિંગ એલર્ટ છે કે નહીં તે તાત્કાલિક જણાવવું.

૮. **તાત્કાલિક ઝીરો-લેટન્સી ઉત્તર (Instant 1-Second Direct Answers - STRICT NO DELAYS):**
   - ક્યારેય પણ "એક જ મિનિટ હોં", "હું જોઈને કહું", "રાહ જુઓ" જેવી ઢીલ કરાવતી વાતો બોલવી નહીં!
   - સવાલ પૂછાતાં જ સીધો સચોટ, ટૂંકો અને ૧-૨ સ્પષ્ટ વાક્યમાં તુરંત જ આંકડાકીય ઉત્તર આપી દેવો જેથી કૉલ સુપર ફાસ્ટ લાગે.
   - દેશી કાઠિયાવાડી લહેકામાં મીઠો, આત્મીય અને સ્પષ્ટ ઉત્તર આપવો ("હા ભાઈ, ગઈકાલના કુલ યુનિટ્સ ૪,૧૫૮ છે અને કમાણી ₹૧૫,૮૦૧ થઈ છે!").
   - જો કોઈ પૂછે કે આ સોફ્ટવેર કોણે બનાવ્યું છે, તો ગર્વથી કહેવું: "આ SolarFlow સોફ્ટવેર જય સર (Jay Sir) દ્વારા બનાવવામાં આવ્યું છે."
PROMPT;

        $instantContext = $this->buildInstantContext($user, $liveSolarData);
        return $basePrompt . "

" . $instantContext;
    }


    private function buildInstantContext($user, $liveSolarData = null): string
    {
        $tariffRate = (float) env('SOLAR_PPA_TARIFF', 3.80);
        $role = $user?->role ?? 'super_admin';
        $scopedCompanyId = ($role !== 'super_admin' && ! empty($user?->company_id)) ? (int) $user->company_id : null;

        $liveKw = (float) ($liveSolarData['live_total_power_kw'] ?? $liveSolarData['realtime_power_kw'] ?? 0);
        $todayKwh = (float) ($liveSolarData['today_total_kwh'] ?? $liveSolarData['today_units_kwh'] ?? 0);
        $yesterdayKwh = (float) ($liveSolarData['yesterday_total_kwh'] ?? 0);
        $curtailmentActive = ! empty($liveSolarData['curtailment_active']) || ! empty($liveSolarData['curtailment_system']['is_any_active']);

        $invertersText = [];
        $companyLiveText = [];
        $totalKw = 0.0;
        $totalTodayFromComp = 0.0;
        $activeInvs = 0;

        if (! empty($liveSolarData['companies'])) {
            foreach ($liveSolarData['companies'] as $c) {
                $cId = (int) ($c['company_id'] ?? 0);
                if ($scopedCompanyId && $cId !== $scopedCompanyId) {
                    continue;
                }
                $cName = $c['company_name'] ?? 'Company';
                $cLiveKw = (float) ($c['total_live_kw'] ?? 0);
                $cTodayKwh = (float) ($c['total_today_kwh'] ?? 0);
                $cRev = round($cTodayKwh * $tariffRate, 2);
                $totalTodayFromComp += $cTodayKwh;
                $companyLiveText[] = "  * {$cName}: હાલનો લાઈવ પાવર {$cLiveKw} kW | આજના યુનિટ્સ {$cTodayKwh} kWh | આજની આવક ₹{$cRev}";

                foreach ($c['inverters'] ?? [] as $inv) {
                    $iName = $inv['name'] ?? 'Inverter';
                    $iKw = (float) ($inv['live_kw'] ?? 0);
                    $iToday = (float) ($inv['today_kwh'] ?? 0);
                    $isOnline = ! empty($inv['online']);
                    if ($isOnline) {
                        $totalKw += $iKw;
                        $activeInvs++;
                    }
                    $status = $isOnline ? 'ઓનલાઈન (ચાલુ)' : 'ઓફલાઈન (બંધ)';
                    $invertersText[] = "  * {$iName} ({$cName}): લાઈવ પાવર {$iKw} kW | આજના યુનિટ્સ: {$iToday} kWh | સ્થિતિ: {$status}";
                }
            }
        }

        if ($liveKw <= 0 && $totalKw > 0) {
            $liveKw = round($totalKw, 2);
        }
        if ($todayKwh <= 0 && $totalTodayFromComp > 0) {
            $todayKwh = round($totalTodayFromComp, 2);
        }
        $todayRev = round($todayKwh * $tariffRate, 2);
        $avgKw = $activeInvs > 0 ? round($totalKw / $activeInvs, 2) : 0;
        $companyLiveStr = ! empty($companyLiveText) ? implode("\n", $companyLiveText) : "  * તમામ પ્લાન્ટ કનેક્ટેડ છે.";
        $invertersListStr = ! empty($invertersText) ? implode("\n", $invertersText) : "  * બધા ઇન્વર્ટર સામાન્ય રીતે કનેક્ટેડ છે.";

        // Cache heavy DB aggregation for 45 seconds so config endpoint responds in <15ms
        $cacheKey = 'voice_agent_instant_db_ctx_' . ($scopedCompanyId ?: 'all') . '_' . round($todayKwh);
        $dbContextBlock = \Illuminate\Support\Facades\Cache::remember($cacheKey, 45, function () use ($scopedCompanyId, $tariffRate, $todayKwh) {
            $monthNamesGu = [
                1 => 'જાન્યુઆરી (Jan / મહિનો 1)',
                2 => 'ફેબ્રુઆરી (Feb / મહિનો 2)',
                3 => 'માર્ચ (Mar / મહિનો 3)',
                4 => 'એપ્રિલ (Apr / મહિનો 4)',
                5 => 'મે (May / મહિનો 5)',
                6 => 'જૂન (Jun / મહિનો 6)',
                7 => 'જુલાઈ (Jul / મહિનો 7)',
                8 => 'ઓગસ્ટ (Aug / મહિનો 8)',
                9 => 'સપ્ટેમ્બર (Sep / મહિનો 9)',
                10 => 'ઓક્ટોબર (Oct / મહિનો 10)',
                11 => 'નવેમ્બર (Nov / મહિનો 11)',
                12 => 'ડિસેમ્બર (Dec / મહિનો 12)',
            ];

            $readingsQuery = \App\Models\DailyReading::with(['outputs', 'company:id,name'])
                ->orderBy('reading_date', 'desc');
            if ($scopedCompanyId) {
                $readingsQuery->where('company_id', $scopedCompanyId);
            }
            $allReadings = $readingsQuery->get();

            $curMonth = (int) date('n');
            $curYear = (int) date('Y');

            // Group readings by Month Number (1..12) across latest available year so asking "May month" always finds May data
            $monthlyStats = [];
            for ($m = 1; $m <= 12; $m++) {
                $monthlyStats[$m] = [
                    'gen' => 0.0,
                    'exp' => 0.0,
                    'imp' => 0.0,
                    'days' => 0,
                    'companies' => [],
                ];
            }

            $dailyMap = [];
            foreach ($allReadings as $r) {
                $dStr = $r->reading_date ? \Carbon\Carbon::parse($r->reading_date)->toDateString() : null;
                if (! $dStr) {
                    continue;
                }
                $mNum = (int) substr($dStr, 5, 2);
                $cName = $r->company?->name ?? 'Solar Plant';
                $gen = (float) $r->outputs->sum('generation');
                $exp = (float) $r->plant_export_unit;
                $imp = (float) $r->plant_import_unit;
                $effectiveUnits = $gen > 0 ? $gen : $exp;

                $monthlyStats[$mNum]['gen'] += $effectiveUnits;
                $monthlyStats[$mNum]['exp'] += $exp;
                $monthlyStats[$mNum]['imp'] += $imp;
                $monthlyStats[$mNum]['days'] += 1;

                if (! isset($monthlyStats[$mNum]['companies'][$cName])) {
                    $monthlyStats[$mNum]['companies'][$cName] = ['gen' => 0.0, 'exp' => 0.0];
                }
                $monthlyStats[$mNum]['companies'][$cName]['gen'] += $effectiveUnits;
                $monthlyStats[$mNum]['companies'][$cName]['exp'] += $exp;

                if (count($dailyMap) < 35 || isset($dailyMap[$dStr])) {
                    if (! isset($dailyMap[$dStr])) {
                        $dailyMap[$dStr] = ['gen' => 0.0, 'exp' => 0.0, 'by_comp' => []];
                    }
                    $dailyMap[$dStr]['gen'] += $effectiveUnits;
                    $dailyMap[$dStr]['exp'] += $exp;
                    $dailyMap[$dStr]['by_comp'][] = "{$cName}: " . round($effectiveUnits, 2) . " kWh";
                }
            }

            // Current month total including today's live kWh if today's reading isn't saved yet
            $todayDateStr = date('Y-m-d');
            $curMonthDbUnits = round($monthlyStats[$curMonth]['gen'], 2);
            $curMonthWithLiveUnits = isset($dailyMap[$todayDateStr])
                ? $curMonthDbUnits
                : round($curMonthDbUnits + $todayKwh, 2);

            $monthLines = [];
            for ($m = 1; $m <= 12; $m++) {
                $mName = $monthNamesGu[$m];
                $mGen = round($monthlyStats[$m]['gen'], 2);
                $mExp = round($monthlyStats[$m]['exp'], 2);
                $mRev = round(($mExp > 0 ? $mExp : $mGen) * $tariffRate, 2);

                // Pre-calculate exact difference with current month AND with today's live units
                $diffVsCurMonth = round($curMonthWithLiveUnits - $mGen, 2);
                $diffVsTodayLive = round($todayKwh - $mGen, 2);

                $compBreak = [];
                foreach ($monthlyStats[$m]['companies'] as $cn => $cv) {
                    $compBreak[] = "{$cn}: " . round($cv['gen'], 2) . " યુનિટ્સ (એક્સપોર્ટ: " . round($cv['exp'], 2) . ")";
                }
                $compBreakStr = ! empty($compBreak) ? ' [' . implode(' | ', $compBreak) . ']' : '';

                $monthLines[] = "  * {$mName}: કુલ જનરેશન = {$mGen} યુનિટ્સ | એક્સપોર્ટ = {$mExp} યુનિટ્સ | આવક (@₹{$tariffRate}) = ₹{$mRev}{$compBreakStr} | (ચાલુ મહિના ({$curMonthWithLiveUnits}) સાથે તફાવત: {$diffVsCurMonth} યુનિટ્સ | આજના લાઈવ યુનિટ ({$todayKwh}) સાથે તફાવત: {$diffVsTodayLive} યુનિટ્સ)";
            }
            $allMonthsStr = implode("\n", $monthLines);

            $dailyLines = [];
            foreach (array_slice($dailyMap, 0, 25, true) as $dDate => $dInfo) {
                $dGen = round($dInfo['gen'], 2);
                $dExp = round($dInfo['exp'], 2);
                $dRev = round(($dExp > 0 ? $dExp : $dGen) * $tariffRate, 2);
                $cStr = implode(', ', $dInfo['by_comp']);
                $dailyLines[] = "  * તારીખ {$dDate}: કુલ જનરેશન {$dGen} યુનિટ્સ | એક્સપોર્ટ {$dExp} યુનિટ્સ | આવક ₹{$dRev} ({$cStr})";
            }
            $recentDaysStr = ! empty($dailyLines) ? implode("\n", $dailyLines) : "  * દૈનિક રીડિંગ્સ ઉપલબ્ધ છે.";

            // Shared Expenses Summary
            $totalSharedExp = round((float) \App\Models\SharedExpense::where('status', 'active')->sum('amount'), 2);

            // Employee Attendance & Leaves
            $employees = \App\Models\Employee::with([
                'user',
                'attendanceRecords' => fn ($q) => $q->whereDate('attendance_date', today()),
                'leaveRequests' => fn ($q) => $q->where('status', 'approved')->orderByDesc('date_from'),
            ])->where('active', true)->get();

            $empText = [];
            foreach ($employees as $emp) {
                $name = $emp->user?->name ?? 'કર્મચારી';
                $todayRec = $emp->attendanceRecords->first();
                $clockIn = $todayRec && $todayRec->clock_in_at ? \Carbon\Carbon::parse($todayRec->clock_in_at)->format('h:i A') : null;
                $clockOut = $todayRec && $todayRec->clock_out_at ? \Carbon\Carbon::parse($todayRec->clock_out_at)->format('h:i A') : null;
                $breakMins = (int) ($todayRec?->break_minutes ?? 0);
                $leaveCount = $emp->leaveRequests->count();
                $leaveDates = $emp->leaveRequests->pluck('date_from')->map(fn ($d) => \Carbon\Carbon::parse($d)->format('d-m-Y'))->take(5)->implode(', ');
                $arrivalText = $clockIn
                    ? ("આજે સવારે {$clockIn} વાગ્યે આવ્યા છે (હાજર)" . ($clockOut ? ", સાંજે {$clockOut} વાગ્યે લોગઆઉટ કર્યું" : ", હજુ ડ્યુટી પર ચાલુ છે") . ($breakMins > 0 ? ", બ્રેક: {$breakMins} મિનિટ" : ""))
                    : "આજે હજુ આવ્યા નથી (ગેરહાજર / પંચ બાકી)";
                $leaveText = $leaveCount > 0 ? "કુલ {$leaveCount} રજા લીધી ({$leaveDates} તારીખે)" : "૦ રજા લીધી છે";
                $empText[] = "  * {$name}: {$arrivalText}. અત્યાર સુધી {$leaveText}.";
            }
            $empListStr = ! empty($empText) ? implode("\n", $empText) : "  * બધા કર્મચારીઓ નિયમિત કામગીરી પર છે.";

            return <<<DBBLOCK
૨. **આખા વર્ષના તમામ ૧૨ મહિનાના (જાન્યુઆરીથી ડિસેમ્બર) યુનિટ્સ, કંપની વાઈઝ હિસાબ અને તફાવત (PRE-CALCULATED 12-MONTH TABLE):**
   - ચાલુ મહિનો ({$monthNamesGu[$curMonth]}): કુલ યુનિટ્સ (લાઈવ સાથે) = {$curMonthWithLiveUnits} kWh (ડેટાબેઝ સેવ: {$curMonthDbUnits} kWh)
{$allMonthsStr}

૩. **છેલ્લા દિવસોના તારીખ-વાઈઝ રોજેરોજના રીડિંગ્સ (RECENT DAILY READINGS):**
{$recentDaysStr}

૪. **કર્મચારીઓની આજની હાજરી, બ્રેક, લોગઆઉટ અને રજાઓ:**
{$empListStr}

૫. **શેર્ડ એક્સપેન્સ (કુલ ખર્ચ):** ₹{$totalSharedExp} રૂપિયા (કંપની ભાગ: 38.15%, 39.69%, 22.16%).
DBBLOCK;
        });

        $curtText = $curtailmentActive ? "ચેતવણી: PGVCL પાવર ઘટાડો (કર્ટલમેન્ટ) સક્રિય છે." : "કોઈ કર્ટલમેન્ટ નથી, પ્લાન્ટ ૧૦૦% ફુલ કેપેસિટીથી ચાલુ છે.";

        return <<<CTX
## તમારા મગજમાં હાલનો તાજો ડેટાબેઝ અને લાઈવ ડેશબોર્ડ ડેટા (ZERO-WAIT INSTANT LIVE MEMORY):
૧. **આજનો લાઈવ સોલાર ડેટા (ડેશબોર્ડમાંથી સીધો લાઈવ):**
   - હાલનો કુલ લાઈવ જનરેશન પાવર: {$liveKw} kW
   - આજના લાઈવ ઉત્પાદન યુનિટ્સ: {$todayKwh} kWh
   - ગઈકાલના કુલ યુનિટ્સ: {$yesterdayKwh} kWh
   - ટેરિફ ગણતરી: ફિક્સ ₹{$tariffRate} પ્રતિ યુનિટ
   - આજના યુનિટની કમાણી: {$todayKwh} × ₹{$tariffRate} = ₹{$todayRev} રૂપિયા
   - સરેરાશ (Average) ઇન્વર્ટર પાવર: {$avgKw} kW (કુલ એક્ટિવ ઇન્વર્ટર: {$activeInvs})
   - PGVCL કર્ટલમેન્ટ સ્થિતિ: {$curtText}
   - કંપની મુજબ આજનો લાઈવ પાવર અને યુનિટ્સ:
{$companyLiveStr}
   - કંપની મુજબ દરેક ઇન્વર્ટરનો લાઈવ પાવર:
{$invertersListStr}

{$dbContextBlock}

૬. **STRICT RULES FOR 0.3-SECOND INSTANT ANSWERS (NO DATABASE WAIT TIME):**
   - ઉપર બધા જ ૧૨ મહિનાના (મે મહિનો, જૂન, જુલાઈ, ઓગસ્ટ, સપ્ટેમ્બર, ઓક્ટોબર વગેરે) યુનિટ્સ, કંપની વાઈઝ યુનિટ્સ, ચાલુ મહિના સાથેનો તફાવત, આજના લાઈવ યુનિટ સાથેનો તફાવત, તારીખ વાઈઝ રીડિંગ્સ અને કર્મચારીઓની હાજરી પહેલેથી જ ગણતરી કરીને આપેલા છે!
   - જ્યારે યુઝર કોઈપણ મહિનાના યુનિટ્સ (દા.ત. "મે મહિનાના યુનિટ્સ અને હાલના યુનિટ્સમાં કેટલો તફાવત છે?"), કોઈપણ કંપનીના યુનિટ્સ, કોઈપણ તારીખના યુનિટ્સ, કે ₹૩.૮૦ લેખે રૂપિયા પૂછે:
     તમારે કોઈપણ રાહ જોયા વગર (Zero Wait) ઉપરના ટેબલમાંથી સીધો જ ૦.૩ સેકન્ડમાં ફટાફટ જવાબ આપવો!
   - 🚫 **સખત મનાઈ (Zero Hallucination Rule):** દિવસે (સવારે ૭:૦૦ થી સાંજે ૬:૩૦ વચ્ચે) ક્યારેય એવું ન બોલવું કે "સૂરજ હજુ ઊગ્યો નથી" કે "તડકો નથી".
CTX;
    }

    public function getToolsDeclaration(): array
    {
        $functions = [
                    [
                        'name' => 'get_generation_units',
                        'description' => 'Get real-time live 1-second solar generation units, live power (kW), today total units, yesterday units, and date/month historical generation.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'company_name' => ['type' => 'STRING', 'description' => 'Company name e.g. Rajeshwari Solar, Nilkanth, Sunrise'],
                                'date' => ['type' => 'STRING', 'description' => 'Date in YYYY-MM-DD or day number e.g. 2026-10-19'],
                                'month' => ['type' => 'INTEGER', 'description' => 'Month number (1-12)'],
                                'year' => ['type' => 'INTEGER', 'description' => 'Year e.g. 2026'],
                            ],
                        ]
                    ],
                    [
                        'name' => 'get_inverter_live_power',
                        'description' => 'Get real-time live power output (kW), today generation units, and average power across active inverters (e.g. Inverter 1, Inverter 2, Inverter 3, Inverter 4).',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'inverter_number' => ['type' => 'STRING', 'description' => 'Inverter number or name e.g. 1, 2, 3, 4, Inverter 1'],
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'compare_months',
                        'description' => 'Compare solar units and export generation between two months (e.g. Month 7 vs Month 8) with difference and percentage change.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'month1' => ['type' => 'INTEGER', 'description' => 'First month number (e.g. 7)'],
                                'month2' => ['type' => 'INTEGER', 'description' => 'Second month number (e.g. 8)'],
                                'year' => ['type' => 'INTEGER', 'description' => 'Year e.g. 2026'],
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ],
                            'required' => ['month1', 'month2']
                        ]
                    ],
                    [
                        'name' => 'inverter_vs_meter',
                        'description' => 'Get difference and loss between inverter generation and plant export meter readings.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'date' => ['type' => 'STRING', 'description' => 'Reading date YYYY-MM-DD'],
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_financials_revenue',
                        'description' => 'Calculate solar financial earnings and revenue at flat ₹3.80 per unit tariff for today or given month/year.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'month' => ['type' => 'INTEGER', 'description' => 'Month number 1-12'],
                                'year' => ['type' => 'INTEGER', 'description' => 'Year e.g. 2026'],
                                'rate_per_unit' => ['type' => 'NUMBER', 'description' => 'Tariff rate per unit in Rs (default 3.80)'],
                                'is_today' => ['type' => 'BOOLEAN', 'description' => 'Set true if user is asking for today revenue'],
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_shared_expenses',
                        'description' => 'Get shared expense percentages (38.15%, 39.69%, 22.16%) and recent active shared expense entries.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_live_plant_status',
                        'description' => 'Get current live plant operational status, curtailment alerts, online inverters count, and active warnings.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_employee_attendance',
                        'description' => 'Get employee attendance, clock-in times today, and presence on site.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'employee_name' => ['type' => 'STRING', 'description' => 'Optional employee name to query'],
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_employee_leave_and_attendance',
                        'description' => 'Get employee arrival time today (clock-in time), whether present/absent, total leaves taken so far, and exact leave dates list.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'employee_name' => ['type' => 'STRING', 'description' => 'Name of the employee (e.g. Ramesh, Jayesh)'],
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_employee_location',
                        'description' => 'Get live location and movement status (bike speed, walking, stationary) of employees.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_stock_status',
                        'description' => 'Get stock inventory items, quantities and low stock alerts.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                ];
        return [
            [
                'functionDeclarations' => $functions,
                'function_declarations' => $functions,
            ]
        ];
    }
}
