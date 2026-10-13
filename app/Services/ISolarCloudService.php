<?php

namespace App\Services;

use App\Models\Company;
use App\Models\DailyReading;
use App\Models\Inverter;
use App\Models\InverterMaintenanceLog;
use App\Models\ISolarCloudToken;
use App\Models\SolarCurtailment;
use Carbon\Carbon;
use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ISolarCloudService
{
    public function __construct(
        protected ?WeatherService $weatherService = null
    ) {
        $this->weatherService = $weatherService ?? new WeatherService();
    }

    public function getAuthUrl(): string
    {
        $authUrl = config('isolarcloud.auth_url', 'https://web3.isolarcloud.in/#/authorized-app');
        if (! str_contains($authUrl, '#/authorized-app')) {
            $authUrl = rtrim($authUrl, '/') . '/#/authorized-app';
        }
        $cloudId = config('isolarcloud.cloud_id', '9');
        $appId = config('isolarcloud.application_id', '3799');
        $redirectUrl = config('isolarcloud.redirect_uri', 'https://www.rns.snwebkarma.in/callback');

        return "{$authUrl}?cloudId={$cloudId}&applicationId={$appId}&redirectUrl=" . urlencode($redirectUrl);
    }

    public function exchangeCode(string $code): array
    {
        $url = rtrim(config('isolarcloud.base_url', 'https://gateway.isolarcloud.in'), '/') . '/openapi/apiManage/token?';
        $appKey = config('isolarcloud.app_key');
        $accessKey = config('isolarcloud.access_key');
        $sysCode = config('isolarcloud.sys_code', '901');
        $redirectUri = config('isolarcloud.redirect_uri');

        $headers = [
            'Content-Type' => 'application/json',
            'x-access-key' => $accessKey,
            'sys_code' => (string) $sysCode,
        ];

        $payload = [
            'appkey' => $appKey,
            'grant_type' => 'authorization_code',
            'code' => trim($code),
            'redirect_uri' => $redirectUri,
        ];

        $response = Http::withHeaders($headers)
            ->timeout(20)
            ->post($url, $payload);

        $json = $response->json() ?? [];

        if (! $response->successful() || ($json['result_code'] ?? null) !== '1' && empty($json['access_token']) && empty($json['result_data']['access_token'])) {
            $msg = $json['result_msg'] ?? $json['error_description'] ?? $json['message'] ?? 'Failed to exchange authorization code.';
            Log::error('iSolarCloud exchangeCode error', ['response' => $json, 'status' => $response->status()]);
            throw new Exception("iSolarCloud Token Error: {$msg}");
        }

        $this->saveTokenData($json);

        return $json;
    }

    public function saveAutoCredentials(string $account, string $password): void
    {
        try {
            $path = storage_path('app/isolarcloud_auto_credentials.json');
            file_put_contents($path, json_encode([
                'user_account' => trim($account),
                'user_password_encrypted' => \Illuminate\Support\Facades\Crypt::encryptString($password),
                'updated_at' => Carbon::now()->toIso8601String(),
            ], JSON_PRETTY_PRINT));
        } catch (\Throwable $e) {
            Log::warning('Failed to save iSolarCloud auto credentials: ' . $e->getMessage());
        }
    }

    public function getAutoCredentials(): ?array
    {
        try {
            $path = storage_path('app/isolarcloud_auto_credentials.json');
            if (file_exists($path)) {
                $data = json_decode((string) file_get_contents($path), true);
                if (! empty($data['user_account']) && ! empty($data['user_password_encrypted'])) {
                    return [
                        'user_account' => $data['user_account'],
                        'user_password' => \Illuminate\Support\Facades\Crypt::decryptString($data['user_password_encrypted']),
                    ];
                }
            }
        } catch (\Throwable $e) {
            // Fallback to env if decryption fails
        }

        $envAccount = env('ISOLARCLOUD_USER_ACCOUNT');
        $envPass = env('ISOLARCLOUD_USER_PASSWORD');
        if (! empty($envAccount) && ! empty($envPass)) {
            return [
                'user_account' => $envAccount,
                'user_password' => $envPass,
            ];
        }

        return null;
    }

    public function loginWithCredentials(?string $account = null, ?string $password = null): ?array
    {
        if (! $account || ! $password) {
            $saved = $this->getAutoCredentials();
            $account = $account ?: ($saved['user_account'] ?? null);
            $password = $password ?: ($saved['user_password'] ?? null);
        }

        if (empty($account) || empty($password)) {
            return null;
        }

        $url = rtrim(config('isolarcloud.base_url', 'https://gateway.isolarcloud.in'), '/') . '/openapi/login';
        $appKey = config('isolarcloud.app_key');
        $accessKey = config('isolarcloud.access_key');
        $sysCode = config('isolarcloud.sys_code', '901');

        if (empty($appKey) || empty($accessKey)) {
            return null;
        }

        $headers = [
            'Content-Type' => 'application/json',
            'x-access-key' => $accessKey,
            'sys_code' => (string) $sysCode,
        ];

        $payload = [
            'appkey' => $appKey,
            'user_account' => trim($account),
            'user_password' => $password,
        ];

        try {
            $response = Http::withHeaders($headers)->timeout(20)->post($url, $payload);
            $json = $response->json() ?? [];
            $resultData = $json['result_data'] ?? [];
            $loginToken = $resultData['token'] ?? $json['access_token'] ?? $resultData['access_token'] ?? null;

            if ($response->successful() && ! empty($loginToken) && ($resultData['login_state'] ?? '1') !== '-1') {
                $this->saveTokenData([
                    'access_token' => $loginToken,
                    'refresh_token' => $resultData['refresh_token'] ?? $json['refresh_token'] ?? null,
                    'expires_in' => (int) ($resultData['expires_in'] ?? 169400),
                    'auth_user' => (string) ($resultData['user_id'] ?? $resultData['user_account'] ?? $account),
                    'result_data' => $resultData,
                ]);
                return $json;
            }
        } catch (\Throwable $e) {
            Log::warning('iSolarCloud auto-login with credentials failed: ' . $e->getMessage());
        }

        return null;
    }

    public function refreshToken(?string $refreshToken = null): ?array
    {
        $url = rtrim(config('isolarcloud.base_url', 'https://gateway.isolarcloud.in'), '/') . '/openapi/apiManage/token?';
        $appKey = config('isolarcloud.app_key');
        $accessKey = config('isolarcloud.access_key');
        $sysCode = config('isolarcloud.sys_code', '901');

        if (empty($appKey) || empty($accessKey)) {
            Log::warning('iSolarCloud refreshToken skipped: app_key or access_key missing');
            return null;
        }

        // Gather candidate refresh tokens from recent records (newest first)
        $candidates = [];
        if (! empty($refreshToken)) {
            $candidates[] = $refreshToken;
        }

        $recentRecords = ISolarCloudToken::latest()->limit(10)->get();
        foreach ($recentRecords as $rec) {
            $rt = $rec->refresh_token
                ?: ($rec->raw_response['refresh_token'] ?? $rec->raw_response['result_data']['refresh_token'] ?? null);
            if (! empty($rt) && ! in_array($rt, $candidates, true)) {
                $candidates[] = $rt;
            }
        }

        if (empty($candidates)) {
            return $this->loginWithCredentials();
        }

        $headers = [
            'Content-Type' => 'application/json',
            'x-access-key' => $accessKey,
            'sys_code' => (string) $sysCode,
        ];

        foreach ($candidates as $candidateRt) {
            try {
                $response = Http::withHeaders($headers)
                    ->timeout(20)
                    ->post($url, [
                        'appkey' => $appKey,
                        'grant_type' => 'refresh_token',
                        'refresh_token' => $candidateRt,
                    ]);

                $json = $response->json() ?? [];

                if ($response->successful() && (! empty($json['access_token']) || ! empty($json['result_data']['access_token']))) {
                    $this->saveTokenData($json);
                    return $json;
                }
            } catch (\Throwable $e) {
                Log::warning('iSolarCloud candidate refreshToken error: ' . $e->getMessage());
            }
        }

        // Layer 3 Fallback: If all refresh tokens failed, attempt automatic credential login
        $autoLogged = $this->loginWithCredentials();
        if ($autoLogged) {
            return $autoLogged;
        }

        Log::warning('iSolarCloud refreshToken failed for all candidates');

        return null;
    }

    public function saveTokenData(array $data): ISolarCloudToken
    {
        $resultData = $data['result_data'] ?? [];
        $accessToken = $data['access_token'] ?? $resultData['access_token'] ?? $resultData['token'] ?? '';
        $refreshToken = $data['refresh_token'] ?? $resultData['refresh_token'] ?? $data['refreshToken'] ?? $resultData['refreshToken'] ?? null;
        
        // Preserve existing refresh token if new response did not include one
        if (! $refreshToken) {
            $lastToken = ISolarCloudToken::latest()->first();
            $refreshToken = $lastToken?->refresh_token
                ?: ($lastToken?->raw_response['refresh_token'] ?? $lastToken?->raw_response['result_data']['refresh_token'] ?? null);
        }

        $tokenType = $data['token_type'] ?? $resultData['token_type'] ?? 'bearer';
        $expiresIn = (int) ($data['expires_in'] ?? $resultData['expires_in'] ?? 169400);
        $authUser = (string) ($resultData['auth_user'] ?? $data['auth_user'] ?? '');
        $authPsList = $resultData['auth_ps_list'] ?? $data['auth_ps_list'] ?? [];

        $expiresAt = $expiresIn > 0 ? Carbon::now()->addSeconds($expiresIn) : null;

        return ISolarCloudToken::create([
            'access_token' => $accessToken,
            'refresh_token' => $refreshToken,
            'token_type' => $tokenType,
            'expires_in' => $expiresIn,
            'expires_at' => $expiresAt,
            'auth_user' => $authUser,
            'auth_ps_list' => $authPsList,
            'raw_response' => $data,
        ]);
    }

    public function getValidToken(): ?string
    {
        $token = ISolarCloudToken::latest()->first();
        if (! $token) {
            if ($this->loginWithCredentials()) {
                $token = ISolarCloudToken::latest()->first();
            }
            if (! $token) {
                return null;
            }
        }

        $effectiveRefreshToken = $token->refresh_token
            ?: ($token->raw_response['refresh_token'] ?? $token->raw_response['result_data']['refresh_token'] ?? null);

        // Proactively refresh if token expires in less than 36 hours (out of 48h), or already expired
        $needsRefresh = ! $token->expires_at
            || Carbon::now()->addHours(36)->gte($token->expires_at)
            || $token->isExpired();

        if ($needsRefresh && ($effectiveRefreshToken || $this->getAutoCredentials())) {
            $cacheKey = 'isolarcloud_token_refresh_attempt_' . md5((string) ($effectiveRefreshToken ?: 'auto_creds'));
            if (! Cache::has($cacheKey)) {
                Cache::put($cacheKey, true, now()->addMinutes(3));
                try {
                    $refreshed = $this->refreshToken($effectiveRefreshToken);
                    if ($refreshed) {
                        $token = ISolarCloudToken::latest()->first();
                    }
                } catch (Exception $e) {
                    Log::warning('Automatic token refresh failed in getValidToken: ' . $e->getMessage());
                }
            }
        }

        if ($token && $token->isExpired()) {
            return null;
        }

        return $token?->access_token;
    }

    public function getDeviceRealTimeData(array $serialNumbers, array $pointIds = ['1', '3']): array
    {
        $token = $this->getValidToken();
        if (! $token) {
            throw new Exception('iSolarCloud is not connected or token has expired. Please authorize with iSolarCloud.');
        }

        $url = rtrim(config('isolarcloud.base_url', 'https://gateway.isolarcloud.in'), '/') . '/openapi/platform/getDeviceRealTimeData';
        $appKey = config('isolarcloud.app_key');
        $accessKey = config('isolarcloud.access_key');
        $sysCode = config('isolarcloud.sys_code', '901');

        $headers = [
            'Content-Type' => 'application/json',
            'x-access-key' => $accessKey,
            'Authorization' => 'Bearer ' . $token,
            'sys_code' => (string) $sysCode,
        ];

        $payload = [
            'appkey' => $appKey,
            'device_type' => '1',
            'sn_list' => array_values(array_unique(array_filter($serialNumbers))),
            'point_id_list' => array_values(array_map('strval', $pointIds)),
            'is_get_point_dict' => '1',
        ];

        $response = Http::withHeaders($headers)
            ->timeout(25)
            ->post($url, $payload);

        $json = $response->json() ?? [];

        if (! $response->successful() || ($json['error'] ?? null)) {
            $errorMsg = $json['error_description'] ?? $json['error'] ?? $json['message'] ?? 'Failed to get device real-time data.';
            if (($json['error'] ?? null) === 'invalid_token' || str_contains(strtolower($errorMsg), 'invalid access token')) {
                // Attempt token refresh (or auto-login fallback) and retry
                $tokenRecord = ISolarCloudToken::latest()->first();
                $effectiveRefresh = $tokenRecord?->refresh_token
                    ?: ($tokenRecord?->raw_response['refresh_token'] ?? $tokenRecord?->raw_response['result_data']['refresh_token'] ?? null);
                if ($this->refreshToken($effectiveRefresh)) {
                    $newTokenRecord = ISolarCloudToken::latest()->first();
                    $newToken = $newTokenRecord?->access_token;
                    if ($newToken) {
                        $headers['Authorization'] = 'Bearer ' . $newToken;
                        $retryResponse = Http::withHeaders($headers)->timeout(25)->post($url, $payload);
                        $retryJson = $retryResponse->json() ?? [];
                        if ($retryResponse->successful() && ! ($retryJson['error'] ?? null)) {
                            return $retryJson;
                        }
                    }
                }
                // Both access_token and refresh_token were rejected by Sungrow (authorization revoked)
                if ($tokenRecord) {
                    $tokenRecord->update(['expires_at' => Carbon::now()->subMinute()]);
                }
            }
            throw new Exception("iSolarCloud RealTimeData Error: {$errorMsg}");
        }

        return $json;
    }

    public function syncDailyGeneration(int $companyId, string $date): array
    {
        $todayDate = Carbon::now('Asia/Kolkata')->format('Y-m-d');
        if ($date !== $todayDate) {
            throw new Exception("iSolarCloud ઓટો-ફેચ માત્ર આજના લાઈવ રીડિંગ્સ ({$todayDate}) માટે જ માન્ય છે. ભૂતકાળની તારીખ ({$date}) માં આજના લાઈવ યુનિટ્સ લાવી શકાતા નથી. કૃપા કરીને જૂની તારીખના યુનિટ્સ મેન્યુઅલી દાખલ કરો.");
        }

        $company = Company::with(['inverters' => fn ($q) => $q->where('active', true)])->findOrFail($companyId);
        $activeInverters = $company->inverters;

        $invertersWithSn = $activeInverters->filter(fn ($inv) => ! empty($inv->serial_number));

        if ($invertersWithSn->isEmpty()) {
            throw new Exception("None of the active inverters in '{$company->name}' have an iSolarCloud Serial Number configured. Please set the Serial Number (e.g. I2640800649) in Company Settings.");
        }

        $snList = $invertersWithSn->pluck('serial_number')->all();
        $pointIds = config('isolarcloud.default_point_ids', ['1', '3']);

        $realtime = $this->getDeviceRealTimeData($snList, $pointIds);

        $devicePointList = $realtime['result_data']['device_point_list'] ?? $realtime['device_point_list'] ?? [];

        // Build map by device_sn
        $snDataMap = [];
        foreach ($devicePointList as $item) {
            $dp = $item['device_point'] ?? $item;
            $sn = $dp['device_sn'] ?? null;
            if ($sn) {
                $snDataMap[$sn] = $dp;
            }
        }

        $outputs = [];
        $devices = [];

        foreach ($invertersWithSn as $inverter) {
            $dp = $snDataMap[$inverter->serial_number] ?? null;
            if ($dp) {
                // p1 is Wh (Today's generation), convert Wh -> kWh (e.g. 510100 Wh = 510.10 kWh)
                $rawP1 = isset($dp['p1']) ? (float) $dp['p1'] : 0.0;
                $value = $rawP1 > 1000 ? round($rawP1 / 1000, 2) : $rawP1;

                $outputs[$inverter->id] = number_format($value, 2, '.', '');
                $devices[] = [
                    'inverter_id' => $inverter->id,
                    'inverter_name' => $inverter->name,
                    'serial_number' => $inverter->serial_number,
                    'device_name' => $dp['device_name'] ?? null,
                    'dev_status' => $dp['dev_status'] ?? null,
                    'generation' => $outputs[$inverter->id],
                    'running_hours' => $dp['p3'] ?? null,
                    'all_points' => $dp,
                ];
            }
        }

        return [
            'success' => true,
            'company_id' => $companyId,
            'company_name' => $company->name,
            'date' => $date,
            'synced_count' => count($outputs),
            'total_inverters' => $activeInverters->count(),
            'outputs' => $outputs,
            'devices' => $devices,
            'point_dict' => $realtime['result_data']['point_dict'] ?? $realtime['point_dict'] ?? [],
        ];
    }

    public function getConnectionStatus(): array
    {
        $this->getValidToken();
        $token = ISolarCloudToken::latest()->first();

        if ($token && ! $token->isExpired()) {
            $firstSn = Inverter::where('active', true)->whereNotNull('serial_number')->value('serial_number');
            if ($firstSn) {
                try {
                    $this->getDeviceRealTimeData([$firstSn], ['1']);
                } catch (Exception $e) {
                    // getDeviceRealTimeData marks token expired if invalid_token and refresh failed
                }
                $token = ISolarCloudToken::latest()->first();
            }
        }

        $isConnected = $token && ! $token->isExpired();

        $expiresInHuman = null;
        if ($token?->expires_at) {
            $expiresInHuman = $token->expires_at->isPast()
                ? 'Expired / Revoked (Please Reconnect)'
                : 'Expires in ' . $token->expires_at->diffForHumans(null, true);
        }

        $autoCreds = $this->getAutoCredentials();

        return [
            'connected' => (bool) $isConnected,
            'auto_login_enabled' => ! empty($autoCreds['user_account']),
            'saved_account' => $autoCreds['user_account'] ?? null,
            'app_key' => config('isolarcloud.app_key'),
            'access_key' => config('isolarcloud.access_key'),
            'redirect_uri' => config('isolarcloud.redirect_uri'),
            'auth_url' => $this->getAuthUrl(),
            'has_token' => (bool) $token,
            'is_expired' => $token ? $token->isExpired() : true,
            'expires_at' => $token?->expires_at?->toIso8601String(),
            'expires_in_human' => $expiresInHuman,
            'auth_user' => $token?->auth_user,
            'auth_ps_list' => $token?->auth_ps_list ?? [],
            'updated_at' => $token?->updated_at?->toIso8601String(),
        ];
    }

    public function getDashboardSolarOverview(?string $companyFilter = null): array
    {
        $companyQuery = Company::where('active', true)
            ->with(['inverters' => fn ($q) => $q->where('active', true)->orderBy('id')]);

        if ($companyFilter && $companyFilter !== 'all') {
            $companyQuery->where('id', (int) $companyFilter);
        }

        $companies = $companyQuery->get();
        $allInverters = $companies->flatMap->inverters;
        $serialNumbers = $allInverters->pluck('serial_number')->filter()->unique()->all();

        $realtimeData = null;
        $isLive = false;

        $realtimeData = null;
        $isLive = false;

        // Sungrow iSolarCloud Official PV String Current Point ID Mapping (device_type = 1):
        // p70..p85  = PV1..PV16 (Strings 1 to 16)
        // p92, p93  = PV17, PV18 (Strings 17 to 18)
        // p96..p101 = PV19..PV24 (Strings 19 to 24)
        // Note: p86..p91 are Power Factor, Monthly Wh, Total Wh, Grid Freq, Reactive Power - NOT PV strings!
        $pvStringPointMap = [
            1 => 'p70',  2 => 'p71',  3 => 'p72',  4 => 'p73',
            5 => 'p74',  6 => 'p75',  7 => 'p76',  8 => 'p77',
            9 => 'p78',  10 => 'p79', 11 => 'p80', 12 => 'p81',
            13 => 'p82', 14 => 'p83', 15 => 'p84', 16 => 'p85',
            17 => 'p92', 18 => 'p93', 19 => 'p96', 20 => 'p97',
            21 => 'p98', 22 => 'p99', 23 => 'p100', 24 => 'p101',
        ];

        if (! empty($serialNumbers) && $this->getValidToken()) {
            try {
                $pointIds = array_merge(['1', '3', '14', '24'], range(70, 85), [92, 93], range(96, 101));
                $pointIds = array_map('strval', $pointIds);
                $realtimeData = $this->getDeviceRealTimeData($serialNumbers, $pointIds);
                $isLive = true;
            } catch (Exception $e) {
                Log::info('getDashboardSolarOverview live fetch fallback', ['message' => $e->getMessage()]);
            }
        }

        $devicePointList = $realtimeData['result_data']['device_point_list'] ?? $realtimeData['device_point_list'] ?? [];
        $snMap = [];
        foreach ($devicePointList as $item) {
            $dp = $item['device_point'] ?? $item;
            if (! empty($dp['device_sn'])) {
                $snMap[$dp['device_sn']] = $dp;
            }
        }

        $totalTodayKwh = 0.0;
        $totalLiveKw = 0.0;
        $totalOnline = 0;
        $totalInverters = $allInverters->count();
        $unitRate = 3.80; // ₹3.80 Rs per kWh unit

        // Check if there are latest DailyReading records to use as fallback/baseline
        $today = Carbon::today();
        $companiesData = [];
        $allCleaningAlerts = [];

        // Active Curtailment Tracking & False Alarm Suppression Engine
        $activeCurtailments = SolarCurtailment::where('status', 'active')->with(['company', 'user'])->get();
        $curtailmentByCompany = $activeCurtailments->keyBy('company_id');

        // Primary company location for weather (Default: Sarva, Botad Solar Plant)
        $primaryCompany = $companies->first();
        $lat = (float) ($primaryCompany?->latitude ?: 22.201360);
        $lon = (float) ($primaryCompany?->longitude ?: 71.494960);
        $plantLoc = $primaryCompany?->plant_location ?: 'Sarva, Botad';
        $weatherData = $this->weatherService->getWeather($lat, $lon, $plantLoc);
        $irradianceNow = (float) ($weatherData['solar_irradiance'] ?? 700);

        // Smart Soiling Filter: Only check 10:30 AM to 4:00 PM (10.5 to 16.0 hrs) and Irradiance > 600 W/m²
        $currentHour = (float) Carbon::now()->format('G') + ((float) Carbon::now()->format('i') / 60);
        $isSoilingWindowActive = ($currentHour >= 10.5 && $currentHour <= 16.0);
        $isIrradianceSufficient = ($irradianceNow >= 600);
        $canRunSoilingCheck = $isSoilingWindowActive && $isIrradianceSufficient;

        foreach ($companies as $company) {
            $companyTodayKwh = 0.0;
            $companyLiveKw = 0.0;
            $companyOnline = 0;
            $invertersList = [];
            $companyCurtailment = $curtailmentByCompany->get($company->id);

            foreach ($company->inverters as $inv) {
                $dp = ! empty($inv->serial_number) ? ($snMap[$inv->serial_number] ?? null) : null;
                $pvStrings = [];
                $inverterAlerts = [];
                $curtInvIds = (array) ($companyCurtailment->inverter_ids ?? []);
                $isInverterCurtailed = $companyCurtailment && (
                    (empty($curtInvIds) && empty($companyCurtailment->pv_strings)) ||
                    in_array($inv->id, $curtInvIds) ||
                    in_array((string) $inv->id, $curtInvIds)
                );

                if ($dp) {
                    $isOnline = ($dp['dev_status'] ?? 0) === 1;
                    // p1 is Wh (Today's generation), convert Wh -> kWh (e.g. 566700 Wh = 566.70 kWh)
                    $rawP1 = isset($dp['p1']) ? (float) $dp['p1'] : 0.0;
                    $todayKwh = $rawP1 > 1000 ? round($rawP1 / 1000, 2) : $rawP1;

                    // p24 is Total Active Power in Watts (W) -> convert to kW
                    if (isset($dp['p24'])) {
                        $rawP24 = (float) $dp['p24'];
                        $liveKw = $isOnline ? round($rawP24 / 1000, 2) : 0.0;
                    } elseif (isset($dp['p14'])) {
                        $rawP14 = (float) $dp['p14'];
                        $liveKw = $isOnline ? round($rawP14 / 1000, 2) : 0.0;
                    } else {
                        $liveKw = $isOnline ? round(min(320.0, max(50.0, ($todayKwh > 0 ? $todayKwh * 0.40 : 250.0))), 2) : 0.0;
                    }
                    $deviceName = $dp['device_name'] ?? null;

                    // Parse PV String currents dynamically using verified Sungrow string points
                    $curtPvData = $companyCurtailment ? (array) ($companyCurtailment->pv_strings ?? []) : [];
                    $activeStringCurrents = [];

                    // Detect highest active/wired string above 16 (up to 24), rounded to a 4-column row multiple (16, 20, or 24)
                    $highestExtraString = 16;
                    for ($sCheck = 17; $sCheck <= 24; $sCheck++) {
                        $checkKey = $pvStringPointMap[$sCheck];
                        $checkVal = isset($dp[$checkKey]) && is_numeric($dp[$checkKey]) ? (float) $dp[$checkKey] : null;
                        $wasWired = \Illuminate\Support\Facades\Cache::get("solar_str_wired_{$company->id}_{$inv->id}_{$sCheck}", false);
                        if (($checkVal !== null && $checkVal >= 0.2 && $checkVal <= 45.0) || $wasWired) {
                            $highestExtraString = $sCheck;
                        }
                    }
                    $maxStrings = $highestExtraString > 20 ? 24 : ($highestExtraString > 16 ? 20 : 16);

                    $pvStrings = [];
                    for ($s = 1; $s <= $maxStrings; $s++) {
                        $pKey = $pvStringPointMap[$s] ?? ('p' . (69 + $s));
                        $rawVal = isset($dp[$pKey]) && is_numeric($dp[$pKey]) ? (float) $dp[$pKey] : 0.0;
                        // Physical DC String Current Filter: Must be between 0.0A and 45.0A
                        $currentA = ($rawVal >= 0.0 && $rawVal <= 45.0) ? round($rawVal, 2) : 0.0;

                        $isStrCurtailed = $isInverterCurtailed;
                        if (! $isStrCurtailed && $companyCurtailment && ! empty($curtPvData)) {
                            $invKey = (string) $inv->id;
                            if (isset($curtPvData[$invKey]) || isset($curtPvData[$inv->id])) {
                                $invPvs = (array) ($curtPvData[$invKey] ?? $curtPvData[$inv->id]);
                                $isStrCurtailed = in_array('PV' . $s, $invPvs) || in_array('PV ' . $s, $invPvs) || in_array($s, $invPvs) || in_array((string) $s, $invPvs);
                            } else {
                                $isStrCurtailed = in_array('PV' . $s, $curtPvData) || in_array('PV ' . $s, $curtPvData) || in_array($s, $curtPvData) || in_array((string) $s, $curtPvData);
                            }
                        }

                        $isConnected = $currentA > 0.1;
                        $pvStrings[$s] = [
                            'string_num' => $s,
                            'string_label' => 'PV' . $s,
                            'current_a' => $currentA,
                            'is_connected' => $isConnected,
                            'is_curtailed' => $isStrCurtailed,
                            'status' => $isStrCurtailed ? 'curtailed' : ($isConnected ? 'normal' : 'offline'),
                        ];
                        if ($currentA > 0.5 && $currentA <= 45.0 && ! $isStrCurtailed) {
                            $activeStringCurrents[] = $currentA;
                        }
                        if ($currentA >= 2.0 && $currentA <= 45.0) {
                            \Illuminate\Support\Facades\Cache::put("solar_str_wired_{$company->id}_{$inv->id}_{$s}", true, 86400 * 7);
                        }
                    }

                    // Smart Seasonal Soiling / Dew / Fog / Zero Current Notice Engine
                    if ($isOnline && ! empty($activeStringCurrents) && count($activeStringCurrents) >= 2 && ! $isInverterCurtailed) {
                        // Healthy baseline = average of top 75% strings
                        sort($activeStringCurrents);
                        $sliceCount = max(1, (int) ceil(count($activeStringCurrents) * 0.7));
                        $topStrings = array_slice($activeStringCurrents, -$sliceCount);
                        $healthyAvg = count($topStrings) > 0 ? (array_sum($topStrings) / count($topStrings)) : 0.0;

                        $tempC = (float) ($weatherData['temperature'] ?? 30.0);
                        $humidity = (float) ($weatherData['humidity'] ?? 50.0);
                        $weatherCode = (int) ($weatherData['weather_code'] ?? 0);
                        $currentMonth = (int) Carbon::now()->format('n');
                        $isWinterMorning = ($currentMonth >= 11 || $currentMonth <= 2 || ($tempC < 22.0 && $humidity >= 80)) && ($currentHour >= 6.5 && $currentHour <= 9.5);
                        $isActualFog = in_array($weatherCode, [45, 48]) || ($humidity >= 92 && $tempC <= 18.0 && $currentHour <= 10.0);
                        $isSummerOrDry = ($tempC >= 28.0) || ($currentMonth >= 3 && $currentMonth <= 10 && ! $isWinterMorning);

                        if ($healthyAvg >= 3.0) { // Only evaluate when healthy current is strong (clear sunshine)
                            $formattedHealthyAvg = number_format($healthyAvg, 1);
                            $inverterProblemStrings = [];
                            $inverterZeroStrings = [];
                            $totalConnectedStrings = count($activeStringCurrents);

                            for ($s = 1; $s <= $maxStrings; $s++) {
                                if ($pvStrings[$s]['is_curtailed'] ?? false) {
                                    continue; // Intentionally curtailed by PGVCL -> suppress false alarm!
                                }
                                $cVal = $pvStrings[$s]['current_a'];
                                $cacheKey = "solar_soiling_since_{$company->id}_{$inv->id}_{$s}";

                                // 1. Zero current check (0.0A on an expected string)
                                if ($cVal <= 0.2) {
                                    $inverterZeroStrings[] = $s;
                                }
                                // 2. Severe drop (drop >= 50% compared to healthy average)
                                elseif ($cVal > 0.5 && $cVal < ($healthyAvg * 0.50)) {
                                    $dropPct = round((1 - ($cVal / $healthyAvg)) * 100);
                                    $pvStrings[$s]['status'] = 'critical_cleaning';
                                    $pvStrings[$s]['drop_pct'] = $dropPct;
                                    $pvStrings[$s]['healthy_avg'] = (float) $formattedHealthyAvg;

                                    // Track persistence duration (15-min passing cloud filter)
                                    $firstSeenTs = \Illuminate\Support\Facades\Cache::remember($cacheKey, 3600, fn () => Carbon::now()->timestamp);
                                    $persistMinutes = max(1, (int) round((Carbon::now()->timestamp - $firstSeenTs) / 60));

                                    $inverterProblemStrings[] = [
                                        'string_num' => $s,
                                        'string_label' => 'PV ' . $s,
                                        'current_a' => $cVal,
                                        'drop_pct' => $dropPct,
                                        'persist_minutes' => $persistMinutes,
                                    ];
                                } else {
                                    \Illuminate\Support\Facades\Cache::forget($cacheKey);
                                }
                            }

                            // Cloud vs Dust Filter: If more than 50% of strings dropped together, it is a passing cloud
                            $isIsolatedIssue = ! empty($inverterProblemStrings) && (count($inverterProblemStrings) <= max(2, (int) round($totalConnectedStrings * 0.45)));

                            if ($isIsolatedIssue && $canRunSoilingCheck) {
                                $strNums = array_map(fn($item) => 'PV ' . $item['string_num'], $inverterProblemStrings);
                                $dropPcts = array_column($inverterProblemStrings, 'drop_pct');
                                $currents = array_column($inverterProblemStrings, 'current_a');
                                $maxDrop = ! empty($dropPcts) ? max($dropPcts) : 50;
                                $worstCurrent = ! empty($currents) ? min($currents) : 2.1;
                                $strText = implode(', ', $strNums);

                                if ($isWinterMorning) {
                                    $noticeType = 'winter_dew';
                                    $noticeBadge = '❄️ સવારની ઝાકળ';
                                    $noticeMessage = "{$company->name} ના {$inv->name} માં {$strText} પર સવારની ભારે ઝાકળ હોવાથી પાવર {$maxDrop}% ઓછો આવી રહ્યો છે. (સામાન્ય: {$formattedHealthyAvg}A | {$strText}: {$worstCurrent}A) - વાઇપર વડે સાફ કરવી.";
                                } else {
                                    $noticeType = 'dust_soiling';
                                    $noticeBadge = '⚠️ ધૂળ / કચરો';
                                    $noticeMessage = "{$company->name} ના {$inv->name} માં {$strText} પર ધૂળ/કચરાના કારણે પાવર {$maxDrop}% ઓછો આવી રહ્યો છે. (સામાન્ય: {$formattedHealthyAvg}A | {$strText}: {$worstCurrent}A) - પ્લેટો વોશ કરવી.";
                                }

                                $alertItem = [
                                    'type' => $noticeType,
                                    'badge' => $noticeBadge,
                                    'company_id' => $company->id,
                                    'company_name' => $company->name,
                                    'inverter_id' => $inv->id,
                                    'inverter_name' => $inv->name,
                                    'device_name' => $deviceName ?: $inv->name,
                                    'serial_number' => $inv->serial_number,
                                    'string_label' => $strText,
                                    'healthy_avg' => (float) $formattedHealthyAvg,
                                    'worst_current' => (float) $worstCurrent,
                                    'drop_pct' => $maxDrop,
                                    'title' => $noticeMessage,
                                    'message' => $noticeMessage,
                                    'strings' => $inverterProblemStrings,
                                ];

                                $inverterAlerts[] = $alertItem;
                                $allCleaningAlerts[] = $alertItem;
                            }

                            // 1. Genuine Zero Current Fault Alert:
                            // Check if a string that was physically wired/active (> 2.0A peak) suddenly drops to 0.0A
                            $wiredZeroStrings = [];
                            foreach ($inverterZeroStrings as $zStrNum) {
                                $wiredKey = "solar_str_wired_{$company->id}_{$inv->id}_{$zStrNum}";
                                // A string is confirmed physically wired if it produced > 2.0A in the past 7 days
                                $isConfirmedWired = \Illuminate\Support\Facades\Cache::get($wiredKey, false);
                                if ($isConfirmedWired) {
                                    $wiredZeroStrings[] = 'PV ' . $zStrNum;
                                }
                            }

                            if (! empty($wiredZeroStrings) && count($wiredZeroStrings) <= 4 && $canRunSoilingCheck) {
                                $zeroStrText = implode(', ', $wiredZeroStrings);
                                $zeroNoticeMessage = "{$company->name} ના {$inv->name} માં {$zeroStrText} માંથી ૦.૦ Amps કરંટ આવે છે. MC4 કનેક્ટર અથવા DC ફ્યુઝ ચેક કરો.";
                                $zeroAlertItem = [
                                    'type' => 'zero_current',
                                    'badge' => '🚨 ૦.૦ Amps ફોલ્ટ',
                                    'company_id' => $company->id,
                                    'company_name' => $company->name,
                                    'inverter_id' => $inv->id,
                                    'inverter_name' => $inv->name,
                                    'device_name' => $deviceName ?: $inv->name,
                                    'serial_number' => $inv->serial_number,
                                    'string_label' => $zeroStrText,
                                    'title' => $zeroNoticeMessage,
                                    'message' => $zeroNoticeMessage,
                                    'strings' => [],
                                ];
                                $inverterAlerts[] = $zeroAlertItem;
                                $allCleaningAlerts[] = $zeroAlertItem;
                            }
                        }

                        // Load calculation for telemetry monitoring (overheat warnings removed as physical temp sensors are absent)
                        $invRatedKw = (float) ($inv->capacity_kw ?: 250.0);
                        $loadPct = $invRatedKw > 0 ? round(($liveKw / $invRatedKw) * 100, 1) : 0;
                        $estimatedInvTemp = null;
                    }
                } else {
                    $todayKwh = 0.0;
                    $liveKw = 0.0;
                    $loadPct = 0;
                    $estimatedInvTemp = null;
                    $isOnline = false;
                    $deviceName = $company->name . ' ' . $inv->name;
                    for ($s = 1; $s <= 16; $s++) {
                        $pvStrings[$s] = [
                            'string_num' => $s,
                            'string_label' => 'PV' . $s,
                            'current_a' => 0.0,
                            'is_connected' => false,
                            'status' => 'offline',
                        ];
                    }
                }

                if ($isOnline) {
                    $companyOnline++;
                    $totalOnline++;
                }

                $companyTodayKwh += $todayKwh;
                $companyLiveKw += $liveKw;

                $invertersList[] = [
                    'id' => $inv->id,
                    'name' => $inv->name,
                    'serial_number' => $inv->serial_number ?: 'N/A',
                    'device_name' => $deviceName,
                    'online' => $isOnline,
                    'is_curtailed' => $isInverterCurtailed,
                    'today_kwh' => number_format($todayKwh, 2, '.', ''),
                    'live_kw' => number_format($liveKw, 2, '.', ''),
                    'estimated_temp_c' => $estimatedInvTemp ?? null,
                    'load_pct' => $loadPct ?? null,
                    'pv_strings' => array_values($pvStrings),
                    'total_strings_count' => count($pvStrings),
                    'active_strings_count' => count(array_filter($pvStrings, fn($p) => ($p['current_a'] ?? 0) > 0.1)),
                    'cleaning_alerts' => $inverterAlerts,
                ];
            }

            $totalTodayKwh += $companyTodayKwh;
            $totalLiveKw += $companyLiveKw;
            $companyRevenueRs = round($companyTodayKwh * $unitRate, 2);

            $companiesData[] = [
                'company_id' => $company->id,
                'company_name' => $company->name,
                'total_today_kwh' => number_format($companyTodayKwh, 2, '.', ''),
                'total_live_kw' => number_format($companyLiveKw, 2, '.', ''),
                'today_revenue_rs' => number_format($companyRevenueRs, 2, '.', ''),
                'online_count' => $companyOnline,
                'total_count' => $company->inverters->count(),
                'is_curtailed' => $companyCurtailment !== null,
                'curtailment' => $companyCurtailment ? [
                    'percentage' => (int) $companyCurtailment->percentage,
                    'started_at_human' => $companyCurtailment->started_at?->format('h:i A'),
                    'step_history' => $companyCurtailment->step_history ?? [],
                ] : null,
                'inverters' => $invertersList,
            ];
        }

        $realtimePowerMw = round($totalLiveKw / 1000, 2);
        $totalRevenueRs = round($totalTodayKwh * $unitRate, 2);

        $now = Carbon::now();
        $nowHour = (int) $now->format('H');
        $currentHourFloat = (float) $nowHour + ((float) $now->format('i') / 60.0);
        $remainingSunHours = max(0, 18.5 - $currentHourFloat);
        $isNight = ($currentHourFloat > 18.2 || $currentHourFloat < 6.5 || $totalLiveKw <= 0);

        // 1. Next 1 hour generation prediction (kWh):
        // Physical astronomical sun elevation model (Sunrise ~06:30, Peak ~12:25, Sunset ~18:15)
        $currentSunElevation = max(0.01, sin(deg2rad(max(0, min(180, ($currentHourFloat - 6.5) / 11.75 * 180)))));
        $midNextHourElevation = max(0.0, sin(deg2rad(max(0, min(180, ($currentHourFloat + 0.5 - 6.5) / 11.75 * 180)))));
        $endNextHourElevation = max(0.0, sin(deg2rad(max(0, min(180, ($currentHourFloat + 1.0 - 6.5) / 11.75 * 180)))));

        // Average sun elevation over the next 60 minutes (Simpson's rule: (start + 4*mid + end) / 6)
        $avgNextHourElevation = ($currentSunElevation + (4.0 * $midNextHourElevation) + $endNextHourElevation) / 6.0;
        $sunElevationRatio = $currentSunElevation > 0.05 ? ($avgNextHourElevation / $currentSunElevation) : 1.0;

        // Also incorporate Open-Meteo next hour radiation change if available
        $irradianceNext = (float) ($weatherData['solar_irradiance_next'] ?? $irradianceNow);
        $radNextRatio = ($irradianceNow >= 80.0 && $irradianceNext > 0)
            ? (($irradianceNow + $irradianceNext) / (2.0 * $irradianceNow))
            : $sunElevationRatio;

        $blendedNext1hRatio = (0.65 * $sunElevationRatio) + (0.35 * $radNextRatio);
        // Allow realistic morning ramp-up (up to 1.35x before 11 AM) and smooth afternoon decline
        $maxNext1hCap = $currentHourFloat < 11.5 ? 1.35 : 1.06;
        $nextHourPowerRatio = max(0.0, min($maxNext1hCap, $blendedNext1hRatio));
        $predictedNextHourKwh = $isNight ? 0.00 : round($totalLiveKw * $nextHourPowerRatio, 2);

        // Company-wise 1-Hour Predictions
        $companyPredictions = [];
        foreach ($companiesData as &$cData) {
            $cLiveKw = (float) $cData['total_live_kw'];
            $cNext1h = $isNight ? 0.00 : round($cLiveKw * $nextHourPowerRatio, 2);
            $cData['predicted_next_1h_kwh'] = number_format($cNext1h, 2, '.', '');
            $companyPredictions[] = [
                'company_id' => $cData['company_id'],
                'company_name' => $cData['company_name'],
                'live_kw' => number_format($cLiveKw, 2, '.', ''),
                'next_1h_kwh' => number_format($cNext1h, 2, '.', ''),
            ];
        }
        unset($cData);

        // 2. Hybrid Smart Solar Model (15-Day DB Baseline + Live Telemetry + Open-Meteo Hourly Irradiance)
        // Solves the morning 1.15x cap bug & temporary passing cloud distortion
        $activeKw = max(0, $totalLiveKw);
        $remainingHoursProfile = [];
        $totalRemainingPredictedKwh = 0.0;
        $daylightProfile = $weatherData['hourly_daylight_profile'] ?? [];

        $plantHistoricalBaseline = Cache::remember('solar_plant_hist_baseline_v2', 1800, function () {
            try {
                $dailyTotals = DailyReading::with('outputs')
                    ->where('reading_date', '<', Carbon::today()->toDateString())
                    ->orderByDesc('reading_date')
                    ->limit(60)
                    ->get()
                    ->groupBy(fn ($r) => Carbon::parse($r->reading_date)->toDateString())
                    ->map(function ($dayReadings) {
                        $sum = 0.0;
                        foreach ($dayReadings as $rd) {
                            $outSum = $rd->outputs ? (float) $rd->outputs->sum('generation') : 0.0;
                            $sum += $outSum > 0 ? $outSum : (float) ($rd->total_generation ?? 0.0);
                        }
                        return $sum;
                    })
                    ->filter(fn ($total) => $total >= 5000.0)
                    ->take(15);

                if ($dailyTotals->count() >= 2) {
                    $vals = $dailyTotals->values()->all();
                    rsort($vals);
                    $topSlice = array_slice($vals, 0, max(2, (int) ceil(count($vals) * 0.75)));
                    $avgDailyKwh = array_sum($topSlice) / count($topSlice);
                    // Standard Botad solar bell-curve integral is ~7.45 peak sun hours
                    $estPeakKw = round($avgDailyKwh / 7.45, 1);
                    return [
                        'avg_daily_kwh' => round($avgDailyKwh, 1),
                        'peak_kw' => max(1400.0, min(3200.0, $estPeakKw)),
                    ];
                }
            } catch (\Throwable $e) {
                // Fallback if DB query fails
            }

            return [
                'avg_daily_kwh' => 17500.0,
                'peak_kw' => 2350.0,
            ];
        });

        if ($currentHourFloat < 18.25 && $currentHourFloat >= 6.5 && $activeKw > 0) {
            // Find today's peak irradiance from Open-Meteo hourly profile (typically at 12 PM - 1 PM)
            $maxDayIrradiance = 860.0;
            foreach ($daylightProfile as $dpItem) {
                $rVal = (float) ($dpItem['radiation_w_m2'] ?? 0);
                if ($rVal > $maxDayIrradiance) {
                    $maxDayIrradiance = $rVal;
                }
            }

            // Scale historical peak kW by proportion of online inverters and today's sky clarity
            $onlineInvRatio = $totalInverters > 0 ? max(0.25, $totalOnline / $totalInverters) : 1.0;
            $baseExpectedPeakKw = $plantHistoricalBaseline['peak_kw'] * $onlineInvRatio;
            $weatherAdjustedPeakKw = $baseExpectedPeakKw * min(1.08, max(0.50, $maxDayIrradiance / 860.0));

            // Calculate current solar curve factor (0.0 to 1.0)
            $currentRadFactor = $irradianceNow > 20 ? min(1.05, $irradianceNow / max(450.0, $maxDayIrradiance)) : $currentSunElevation;
            $currentCurveFactor = (0.55 * $currentSunElevation) + (0.45 * $currentRadFactor);

            // Implied noon peak from live kW (clamped within realistic plant bounds to prevent cloud/early-morning distortion)
            $liveImpliedPeakKw = $currentCurveFactor >= 0.15
                ? ($activeKw / $currentCurveFactor)
                : $weatherAdjustedPeakKw;
            $liveImpliedPeakKw = max($baseExpectedPeakKw * 0.45, min($baseExpectedPeakKw * 1.15, $liveImpliedPeakKw));

            // Dynamic blending weight based on time of day:
            // Early morning (before 9 AM) relies more on 15-day DB + Weather; midday relies more on Live Power
            if ($currentHourFloat < 8.75) {
                $liveWeight = 0.35;
            } elseif ($currentHourFloat < 10.5) {
                $liveWeight = 0.60;
            } elseif ($currentHourFloat <= 16.0) {
                $liveWeight = 0.72;
            } else {
                $liveWeight = 0.45;
            }
            $effectiveNoonPeakKw = ($liveWeight * $liveImpliedPeakKw) + ((1.0 - $liveWeight) * $weatherAdjustedPeakKw);

            for ($h = $nowHour; $h <= 18; $h++) {
                // Midpoint of hour h (for 18:00, sunset is ~18:20 so effective generation fraction is smaller)
                $midHour = $h === 18 ? 18.10 : ($h + 0.5);
                $hourDurationFactor = $h === 18 ? 0.35 : 1.0;
                $hourElevation = max(0.0, sin(deg2rad(max(0, min(180, ($midHour - 6.5) / 11.75 * 180)))));
                $rad = isset($daylightProfile[$h]['radiation_w_m2']) && (float) $daylightProfile[$h]['radiation_w_m2'] > 10
                    ? (float) $daylightProfile[$h]['radiation_w_m2']
                    : round($hourElevation * 860, 0);

                $hourRadFactor = min(1.05, $rad / max(450.0, $maxDayIrradiance));
                $hourCurveFactor = (0.55 * $hourElevation) + (0.45 * $hourRadFactor);

                $modelHourKw = $effectiveNoonPeakKw * $hourCurveFactor * $hourDurationFactor;

                if ($h === $nowHour) {
                    // Blend current live telemetry power with model hour power for the active hour
                    $estHourKw = round(((0.65 * $activeKw) + (0.35 * $modelHourKw)) * $hourDurationFactor, 1);
                    $minLeft = max(0, 60 - (int) $now->format('i'));
                    $frac = $minLeft / 60.0;
                    $thisHourRemainingKwh = round($estHourKw * $frac, 1);
                    $totalRemainingPredictedKwh += $thisHourRemainingKwh;
                    $remainingHoursProfile[] = [
                        'hour' => Carbon::createFromTime($h, 0)->format('h A'),
                        'kwh' => $estHourKw,
                        'remaining_kwh' => $thisHourRemainingKwh,
                        'irradiance' => (int) $rad,
                        'status' => 'current',
                    ];
                } else {
                    // For the immediately upcoming hour (nowHour + 1), smoothly bridge live power and model curve
                    if ($h === $nowHour + 1 && $h < 18) {
                        $estKwh = round((0.30 * ($activeKw * $nextHourPowerRatio)) + (0.70 * $modelHourKw), 1);
                    } else {
                        $estKwh = round($modelHourKw, 1);
                    }
                    $totalRemainingPredictedKwh += $estKwh;
                    $remainingHoursProfile[] = [
                        'hour' => Carbon::createFromTime($h, 0)->format('h A'),
                        'kwh' => $estKwh,
                        'irradiance' => (int) $rad,
                        'status' => 'upcoming',
                    ];
                }
            }
            $predictedEodKwh = round($totalTodayKwh + $totalRemainingPredictedKwh, 2);
        } else {
            $predictedEodKwh = $totalTodayKwh;
        }

        // Heat loss live power calculation
        $heatLossPct = (float) ($weatherData['heat_loss']['heat_loss_pct'] ?? 0.0);
        $heatLossKw = $activeKw > 0 ? round($activeKw * ($heatLossPct / 100.0), 1) : 0.0;

        // Day/Night and active generation detection
        $isNight = ($currentHourFloat > 18.2 || $currentHourFloat < 6.5 || $totalLiveKw <= 0);
        $isDaytimeGenerationActive = (!$isNight && $currentHourFloat >= 10.5 && $currentHourFloat <= 18.0 && $totalLiveKw > 0);

        // ── 1. Inverter Underperformance Analysis (3-Layer Smart Self-Baseline + Active String Normalization) ──
        $allOnlineInvertersList = [];
        foreach ($companiesData as $c) {
            $isCompanyCurtailed = !empty($c['is_curtailed']);
            foreach ($c['inverters'] as $inv) {
                if (!empty($inv['online'])) {
                    // Suppress alerts for inverters/companies under active curtailment
                    if ($isCompanyCurtailed || !empty($inv['is_curtailed'])) {
                        continue;
                    }
                    $allOnlineInvertersList[] = [
                        'company_id' => $c['company_id'],
                        'company_name' => $c['company_name'],
                        'id' => $inv['id'],
                        'name' => $inv['name'],
                        'device_name' => $inv['device_name'],
                        'today_kwh' => (float) $inv['today_kwh'],
                        'live_kw' => (float) $inv['live_kw'],
                        'active_strings_count' => (int) ($inv['active_strings_count'] ?? 0),
                        'has_string_alerts' => !empty($inv['cleaning_alerts']),
                    ];
                }
            }
        }

        // Layer 1: Compute each inverter's 15-day historical capacity ratio from DailyInverterOutput
        // so an inverter with fewer solar panels (e.g. naturally 9-10% lower every day) uses its OWN baseline!
        $historicalRatios = Cache::remember('inverter_historical_ratios_v1', 3600, function () {
            $ratiosByInverter = [];
            try {
                $recentDates = DailyReading::query()
                    ->whereDate('reading_date', '<', Carbon::today()->toDateString())
                    ->orderByDesc('reading_date')
                    ->limit(45)
                    ->pluck('reading_date')
                    ->map(fn ($d) => Carbon::parse($d)->toDateString())
                    ->unique()
                    ->take(15);

                foreach ($recentDates as $dateStr) {
                    $dayReadings = DailyReading::whereDate('reading_date', $dateStr)->with('outputs')->get();
                    $dayInvGen = [];
                    foreach ($dayReadings as $dr) {
                        foreach ($dr->outputs as $out) {
                            $gen = (float) $out->generation;
                            if ($gen >= 50.0) {
                                $dayInvGen[$out->inverter_id] = $gen;
                            }
                        }
                    }

                    if (count($dayInvGen) >= 3) {
                        $vals = array_values($dayInvGen);
                        rsort($vals);
                        $topCount = max(1, (int) ceil(count($vals) * 0.5));
                        $dayBenchmark = array_sum(array_slice($vals, 0, $topCount)) / $topCount;
                        if ($dayBenchmark >= 100.0) {
                            foreach ($dayInvGen as $invId => $genVal) {
                                $r = $genVal / $dayBenchmark;
                                if ($r >= 0.55 && $r <= 1.05) {
                                    $ratiosByInverter[$invId][] = $r;
                                }
                            }
                        }
                    }
                }
            } catch (\Throwable $e) {}

            $finalRatios = [];
            foreach ($ratiosByInverter as $invId => $rList) {
                if (count($rList) >= 2) {
                    sort($rList);
                    // Use upper-median historical ratio so past fault days don't skew baseline
                    $idx = (int) floor((count($rList) - 1) * 0.6);
                    $finalRatios[$invId] = round(min(1.0, max(0.65, $rList[$idx])), 4);
                }
            }
            return $finalRatios;
        });

        $underperformingInverters = [];
        // Only run live discrepancy analysis when generation is active during daytime
        if ($isDaytimeGenerationActive && count($allOnlineInvertersList) >= 2) {
            $kwhValues = array_column($allOnlineInvertersList, 'today_kwh');
            rsort($kwhValues);
            // Top 50% healthy average across plant
            $topHalfCount = max(1, (int) ceil(count($kwhValues) * 0.5));
            $healthyBenchmarkKwh = array_sum(array_slice($kwhValues, 0, $topHalfCount)) / $topHalfCount;

            // Layer 2: Determine top active PV strings count across the plant
            $strCounts = array_column($allOnlineInvertersList, 'active_strings_count');
            rsort($strCounts);
            $topStringsBenchmark = !empty($strCounts) && $strCounts[0] > 0 ? (float) $strCounts[0] : 16.0;

            if ($healthyBenchmarkKwh >= 50.0) {
                foreach ($allOnlineInvertersList as $inv) {
                    $invId = $inv['id'];
                    $rawRatioToday = $inv['today_kwh'] / $healthyBenchmarkKwh;

                    // Determine expected capacity factor for this specific inverter:
                    // 1. Historical DB baseline ratio (if available)
                    $histRatio = $historicalRatios[$invId] ?? null;

                    // 2. Physical connected PV strings ratio (e.g. 14 strings vs 16 strings = 0.875)
                    $invStrCount = (float) ($inv['active_strings_count'] ?? 0);
                    $stringRatio = ($invStrCount >= 6 && $topStringsBenchmark >= 8)
                        ? min(1.0, max(0.65, $invStrCount / $topStringsBenchmark))
                        : 1.0;

                    // 3. Rolling healthy ratio learned when all wired strings on this inverter have zero faults
                    $rollingKey = "solar_inv_healthy_ratio_v2_{$invId}";
                    $rollingRatio = Cache::get($rollingKey);
                    if (!$inv['has_string_alerts'] && $rawRatioToday >= 0.85 && $rawRatioToday <= 1.0) {
                        // When all wired PV strings on this inverter are balanced & healthy (no 0.0A wired string and no 50% string drop),
                        // a 1% to 14% difference is purely structural (fewer solar plates installed on this inverter).
                        $learnedRatio = $rollingRatio ? round(($rollingRatio * 0.7) + ($rawRatioToday * 0.3), 4) : round($rawRatioToday, 4);
                        Cache::put($rollingKey, $learnedRatio, 86400 * 14);
                        $rollingRatio = $learnedRatio;
                    }

                    $candidateRatios = array_filter([$histRatio, $stringRatio, $rollingRatio], fn ($v) => $v !== null);
                    $expectedCapacityRatio = !empty($candidateRatios) ? min($candidateRatios) : 1.0;
                    $expectedCapacityRatio = min(1.0, max(0.65, $expectedCapacityRatio));

                    // Personal expected benchmark for THIS inverter based on its own panel/string count
                    $personalBenchmarkKwh = round($healthyBenchmarkKwh * $expectedCapacityRatio, 1);
                    if ($personalBenchmarkKwh < 25.0) {
                        continue;
                    }

                    $dropDiffKwh = round($personalBenchmarkKwh - $inv['today_kwh'], 1);
                    $dropDiffPct = round(($dropDiffKwh / $personalBenchmarkKwh) * 100, 1);

                    // Layer 3: Trigger warning ONLY when there is a real fault:
                    // - Either >= 15% (and >= 25 kWh) drop below its OWN personal benchmark, OR
                    // - >= 10% (and >= 20 kWh) drop below its own benchmark combined with an active PV string fault
                    $isRealFaultDrop = ($dropDiffPct >= 15.0 && $dropDiffKwh >= 25.0)
                        || ($inv['has_string_alerts'] && $dropDiffPct >= 10.0 && $dropDiffKwh >= 20.0);

                    if ($isRealFaultDrop) {
                        $lossRs = round($dropDiffKwh * $unitRate, 2);
                        $underperformingInverters[] = [
                            'company_name' => $inv['company_name'],
                            'inverter_name' => $inv['name'],
                            'device_name' => $inv['device_name'],
                            'today_kwh' => $inv['today_kwh'],
                            'benchmark_kwh' => $personalBenchmarkKwh,
                            'diff_kwh' => $dropDiffKwh,
                            'diff_pct' => $dropDiffPct,
                            'loss_rs' => $lossRs,
                            'title' => "{$inv['company_name']} - {$inv['name']}: તેની સામાન્ય ક્ષમતા ({$personalBenchmarkKwh} kWh) કરતા ~{$dropDiffKwh} યુનિટ્સ ({$dropDiffPct}%) ઓછા આપે છે",
                            'advice' => 'આ ઇન્વર્ટરના MC4 કનેક્ટર, ડીસી ફ્યુઝ, સ્ટ્રિંગ વોલ્ટેજ અથવા ટ્રીપિંગ તાત્કાલિક સાઈટ પર ચેક કરો.',
                        ];
                    }
                }
            }
        }

        // ── 2. Cloud Passing vs Technical Fault AI Detection ──
        if ($isNight) {
            $cloudVsFault = [
                'type' => 'night_standby',
                'badge' => '🌙 રાત્રિ મોડ (Standby)',
                'title' => 'સૂર્યાસ્ત બાદ પ્લાન્ટ બંધ છે',
                'message' => 'રાત્રિના સમયે સોલાર ઉત્પાદન બંધ છે. સવારે સૂર્યોદય (~૦૬:૩૦ AM) સાથે લાઈવ જનરેશન આપમેળે શરૂ થશે.',
                'theme' => 'info',
            ];
        } else {
            $cloudVsFault = [
                'type' => 'normal',
                'badge' => '⚡ નોર્મલ (Stable)',
                'title' => 'પ્લાન્ટ સ્થિર ચાલી રહ્યો છે',
                'message' => 'બધા ઇન્વર્ટર અને સ્ટ્રિંગ્સ સંતુલિત ઉત્પાદન આપી રહ્યા છે.',
                'theme' => 'success',
            ];

            if (count($allOnlineInvertersList) >= 3 && $irradianceNow >= 150) {
                $liveKwValues = array_column($allOnlineInvertersList, 'live_kw');
                $maxLiveKw = max($liveKwValues);
                $minLiveKw = min($liveKwValues);
                $avgLiveKw = array_sum($liveKwValues) / count($liveKwValues);

                $lowCount = 0;
                foreach ($liveKwValues as $lkw) {
                    if ($maxLiveKw > 80 && $lkw < ($maxLiveKw * 0.45)) {
                        $lowCount++;
                    }
                }

                if ($lowCount >= max(3, (int) round(count($liveKwValues) * 0.65))) {
                    // Whole plant dropped together -> Cloud
                    $cloudVsFault = [
                        'type' => 'passing_cloud',
                        'badge' => '🌤️ પાસિંગ ક્લાઉડ (વાદળું)',
                        'title' => 'આકાશમાં વાદળું પસાર થઈ રહ્યું છે',
                        'message' => 'બધા ઇન્વર્ટરનો પાવર એકસાથે ઘટ્યો છે, જે કુદરતી વાદળ છે. પ્લાન્ટમાં કોઈ ફોલ્ટ નથી.',
                        'theme' => 'info',
                    ];
                } elseif ($lowCount >= 1 && $lowCount <= 2 && $maxLiveKw >= 100) {
                    // Isolated 1-2 inverters dropped while others are high -> Technical fault!
                    $cloudVsFault = [
                        'type' => 'technical_fault',
                        'badge' => '🚨 ટેકનિકલ ફોલ્ટ ડિટેક્ટ',
                        'title' => 'આ વાદળું નથી - ઇન્વર્ટર ટ્રીપિંગ / ફોલ્ટ!',
                        'message' => 'બાકીના ઇન્વર્ટર ફૂલ ચાલે છે પણ ૧-૨ ઇન્વર્ટર અચાનક ડ્રોપ થયા છે. સાઈટ પર તાત્કાલિક ચેક કરો.',
                        'theme' => 'danger',
                    ];
                }
            }
        }

        // ── 3. Grid Downtime & Revenue Loss Tracker ──
        // Only trigger genuine PGVCL line outage if telemetry connection is actually live ($isLive)
        // and daytime power is 0 kW under bright daylight (> 120 W/m²). Never trigger on API timeouts.
        $isGridDown = ($isLive && ! $isNight && $currentHourFloat >= 8.0 && $currentHourFloat <= 17.5 && ($totalOnline === 0 || $totalLiveKw <= 0.5) && $irradianceNow >= 120);
        $downtimeMinutes = 0;
        $downtimeLostKwh = 0.0;
        $downtimeLostRs = 0.0;
        $downKey = 'plant_grid_downtime_start_' . date('Y_m_d');

        if ($isGridDown) {
            $startTimeUnix = Cache::get($downKey);
            if (!$startTimeUnix) {
                $startTimeUnix = time();
                Cache::put($downKey, $startTimeUnix, 86400);
            }
            $downtimeMinutes = max(1, (int) round((time() - $startTimeUnix) / 60));
            $downtimeLostKwh = round(($downtimeMinutes / 60.0) * min(3000, ($irradianceNow / 850.0) * 2400.0), 1);
            $downtimeLostRs = round($downtimeLostKwh * $unitRate, 2);
        } else {
            Cache::forget($downKey);
        }

        $gridDowntimeTracker = [
            'is_down' => $isGridDown,
            'downtime_minutes' => $downtimeMinutes,
            'lost_units_kwh' => $downtimeLostKwh,
            'lost_revenue_rs' => $downtimeLostRs,
            'title' => $isNight ? '🌙 પ્લાન્ટ રાત્રિ સ્લીપ મોડમાં છે' : ($isGridDown ? "🚨 PGVCL 66kV / 11kV લાઈન ટ્રીપ ({$downtimeMinutes} મિનિટ)" : '⚡ ગ્રીડ પાવર સામાન્ય છે'),
            'message' => $isNight ? 'રાત્રિના સમયે ગ્રીડ ટ્રીપિંગ કે લોસ લાગુ થતો નથી.' : ($isGridDown ? "પ્લાન્ટ {$downtimeMinutes} મિનિટથી બંધ છે — અંદાજે ~{$downtimeLostKwh} યુનિટ્સ (₹{$downtimeLostRs} નું નુકસાન) થયું છે. 66kV સબસ્ટેશન કે 11kV બ્રેકર તપાસો." : 'પ્લાન્ટ ગ્રીડ સાથે સક્રિય રીતે જોડાયેલો છે.'),
        ];

        // ── 4. Cleaning Gain & ROI Tracker ──
        $cleaningRoiTracker = null;

        // ── 5. System Smart Alerts Engine ──
        // (A) Grid Outage Alert (PGVCL 66kV / 11kV Outage)
        $gridOutageAlert = [
            'active' => $isGridDown,
            'type' => 'grid_outage',
            'badge' => '⚡ PGVCL 66kV / 11kV લાઈન ટ્રીપ',
            'title' => '🚨 PGVCL 66kV / 11kV લાઈન ટ્રીપ અથવા પ્લાન્ટ બંધ!',
            'message' => "દિવસે તડકો હોવા છતાં પ્લાન્ટમાં લાઈવ જનરેશન ૦ kW થઈ ગયું છે. PGVCL 66kV સબસ્ટેશન લાઇન અથવા 11kV બ્રેકર ટ્રીપ થયું હોવાની પૂરી શક્યતા છે. સબસ્ટેશન સ્ટાફનો સંપર્ક કરો.",
            'downtime_minutes' => $downtimeMinutes,
            'lost_units_kwh' => $downtimeLostKwh,
            'lost_revenue_rs' => $downtimeLostRs,
            'theme' => 'danger',
        ];

        // (B) Curtailment Reminders (Active >= 90 mins or afternoon >= 16:30)
        $curtailmentReminders = [];
        foreach ($activeCurtailments as $c) {
            $startedAt = $c->started_at ?: $now;
            $mins = max(1, (int) round($startedAt->diffInMinutes($now)));
            if ($mins >= 90 || $currentHourFloat >= 16.5) {
                $durHuman = $mins < 60 ? "{$mins} મિનિટ" : floor($mins / 60) . " કલાક " . ($mins % 60) . " મિનિટ";
                $curtailmentReminders[] = [
                    'id' => $c->id,
                    'company_id' => $c->company_id,
                    'company_name' => $c->company?->name ?? 'Solar Plant',
                    'percentage' => (int) $c->percentage,
                    'duration_minutes' => $mins,
                    'duration_human' => $durHuman,
                    'title' => "કર્ટેલમેન્ટ {$durHuman} થી સક્રિય છે!",
                    'message' => "{$c->company?->name} માં {$c->percentage}% પાવર કટ લાંબા સમયથી સક્રિય છે. જો જેટકો તરફથી લાઇન ક્લિયર થઈ ગઈ હોય તો પાવર ૧૦૦% રિસ્ટોર કરો જેથી યુનિટ્સનું નુકસાન ન થાય.",
                ];
            }
        }

        // (C) Daily Reading Tracker & Alerts (Deadline: 7:30 PM / 19:30, confirmation when saved, and check for past missing dates)
        // A complete reading requires BOTH: Inverter generation outputs AND Physical Meter readings (Plant & Sub Export)
        $todayDateStr = Carbon::today()->toDateString();
        $todayReadings = DailyReading::whereDate('reading_date', $todayDateStr)->with('outputs')->get()->keyBy('company_id');
        $isPast730Pm = ($currentHourFloat >= 19.5 || ($isNight && $currentHourFloat < 5.0));

        $todayMissingComps = [];
        $todayMeterMissingComps = [];
        $todayCompletedComps = [];

        foreach ($companies as $comp) {
            $rd = $todayReadings->get($comp->id);
            if (! $rd) {
                $todayMissingComps[] = $comp->name;
            } else {
                $hasInverters = $rd->outputs && $rd->outputs->isNotEmpty() && $rd->outputs->sum('generation') > 0;
                $hasMeters = (float) $rd->plant_export_reading > 0.01 || (float) $rd->sub_export_reading > 0.01;

                if ($hasInverters && $hasMeters) {
                    $todayCompletedComps[] = $comp->name;
                } elseif ($hasInverters && ! $hasMeters) {
                    $todayMeterMissingComps[] = $comp->name;
                } else {
                    $todayMissingComps[] = $comp->name;
                }
            }
        }

        $todayReadingStatus = null;
        $isPast700Pm = ($currentHourFloat >= 19.0 || ($isNight && $currentHourFloat < 5.0));
        $isBetween615And730 = ($currentHourFloat >= 18.25 && $currentHourFloat < 19.5);

        if (count($todayCompletedComps) === $companies->count() && empty($todayMeterMissingComps) && empty($todayMissingComps)) {
            // All companies entered completely (both inverters and physical meters)!
            $todayReadingStatus = [
                'status' => 'completed',
                'active' => true,
                'type' => 'daily_reading_completed',
                'badge' => '✅ સેવ થઈ ગયું',
                'title' => 'આજના રીડિંગ અને યુનિટ કમ્પ્લીટ સેવ થઈ ગયા છે!',
                'message' => 'આજના રીડિંગના યુનિટ કમ્પ્લીટ સેવ કરી નાખ્યા આવી ગયા છે કમ્પ્લીટ (તમામ મીટર અને ઇન્વર્ટર ડેટા ઓકે છે).',
                'theme' => 'success',
            ];
        } elseif (! empty($todayMeterMissingComps) && $isPast700Pm) {
            // After 7:00 PM: Inverter generation entered/synced, but physical meter numbers are still 0.00 / missing!
            $mNames = implode(', ', $todayMeterMissingComps);
            $todayReadingStatus = [
                'status' => 'meter_missing',
                'active' => true,
                'type' => 'daily_reading_meter_missing',
                'badge' => '⚠️ મીટર રીડિંગ બાકી (૭:૦૦ PM પછી)',
                'title' => "ઇન્વર્ટર ડેટા ભરાયો છે પણ મીટર રીડિંગ બાકી છે!",
                'message' => "{$mNames} ના ઇન્વર્ટર યુનિટ સિસ્ટમમાં સેવ થયેલા છે, પરંતુ પ્લાન્ટ / સબ-સ્ટેશન એક્સપોર્ટ મીટર રીડિંગ (Plant & Sub Export Meter) ભરવાનું બાકી છે. કૃપા કરી દિવસના અંતનું મીટર રીડિંગ સબમિટ કરો.",
                'missing_companies' => $todayMeterMissingComps,
                'theme' => 'warning',
            ];
        } elseif (! empty($todayMissingComps) && $isPast730Pm) {
            // After 7:30 PM and reading not entered at all
            $missingNames = implode(', ', $todayMissingComps);
            $todayReadingStatus = [
                'status' => 'missing',
                'active' => true,
                'type' => 'daily_reading_missing',
                'badge' => '⏰ રીડિંગ બાકી છે (૭:૩૦ સમય પૂર્ણ)',
                'title' => 'આજનું ડેઇલી રીડિંગ હજુ ભરાયું નથી!',
                'message' => "સાંજે ૭:૩૦ વાગ્યા સુધીમાં રીડિંગ ભરવાનો સમય પૂર્ણ થયો છે. {$missingNames} નું મીટર/ઇન્વર્ટર રીડિંગ ભરવાનું બાકી છે. કૃપા કરી તાત્કાલિક એન્ટ્રી પૂરી કરો.",
                'missing_companies' => $todayMissingComps,
                'theme' => 'warning',
            ];
        } elseif (! empty($todayMissingComps) && $isBetween615And730) {
            // Between 6:15 PM and 7:30 PM: Reading collection window is open
            $missingNames = implode(', ', $todayMissingComps);
            $todayReadingStatus = [
                'status' => 'due_now',
                'active' => true,
                'type' => 'daily_reading_due_now',
                'badge' => '⏰ રીડિંગ સમય (૬:૧૫ થી ૭:૩૦)',
                'title' => 'આજનું ડેઇલી રીડિંગ ભરવાનો સમય થઈ ગયો છે!',
                'message' => "સાંજે ૬:૧૫ પછી મીટર અને ઇન્વર્ટરનું રીડિંગ લેવાનું હોય છે. {$missingNames} નું રીડિંગ ૭:૩૦ વાગ્યા સુધીમાં સિસ્ટમમાં સબમિટ કરો.",
                'missing_companies' => $todayMissingComps,
                'theme' => 'info',
            ];
        }

        // Check past 5 days for any missing readings or meter readings
        $pastMissingDates = [];
        for ($dayOffset = 1; $dayOffset <= 5; $dayOffset++) {
            $pastDate = Carbon::today()->subDays($dayOffset);
            $pastDateStr = $pastDate->toDateString();
            $pastReadings = DailyReading::whereDate('reading_date', $pastDateStr)->with('outputs')->get()->keyBy('company_id');

            $dateMissingDetails = [];
            foreach ($companies as $comp) {
                $rd = $pastReadings->get($comp->id);
                if (! $rd) {
                    $dateMissingDetails[] = "{$comp->name} (રીડિંગ બાકી)";
                } else {
                    $hasInverters = $rd->outputs && $rd->outputs->isNotEmpty() && $rd->outputs->sum('generation') > 0;
                    $hasMeters = (float) $rd->plant_export_reading > 0.01 || (float) $rd->sub_export_reading > 0.01;

                    if ($hasInverters && ! $hasMeters) {
                        $dateMissingDetails[] = "{$comp->name} (મીટર રીડિંગ બાકી)";
                    } elseif (! $hasInverters && ! $hasMeters) {
                        $dateMissingDetails[] = "{$comp->name} (રીડિંગ બાકી)";
                    }
                }
            }

            if (! empty($dateMissingDetails)) {
                $pastMissingDates[] = [
                    'date_formatted' => $pastDate->format('d M Y'),
                    'date_ymd' => $pastDateStr,
                    'companies' => $dateMissingDetails,
                    'companies_label' => implode(', ', $dateMissingDetails),
                ];
            }
        }

        $pastReadingMissingAlert = null;
        if (! empty($pastMissingDates)) {
            $dateSummaries = array_map(fn($item) => "{$item['date_formatted']} [{$item['companies_label']}]", $pastMissingDates);
            $pastReadingMissingAlert = [
                'active' => true,
                'type' => 'past_reading_missing',
                'badge' => '🚨 પાછલી તારીખનું રીડિંગ/મીટર બાકી',
                'title' => 'પાછલી તારીખનું ડેઇલી રીડિંગ અથવા મીટર રીડિંગ અધૂરું છે!',
                'message' => "નીચેની તારીખનું રીડિંગ સિસ્ટમમાં અધૂરું છે: " . implode(' | ', $dateSummaries) . ". આ તારીખનું મીટર/ઇન્વર્ટર રીડિંગ પૂર્ણ સબમિટ કરો.",
                'missing_dates' => $pastMissingDates,
                'theme' => 'danger',
            ];
        }

        // (D) Inverter Fan & Filter 10-Day Routine Cleaning Cycle
        try {
            $lastFanCleanLog = InverterMaintenanceLog::where('maintenance_type', 'fan_dust_cleaning')->latest('cleaned_at')->first();
        } catch (\Throwable $e) {
            $lastFanCleanLog = null;
        }
        $lastCleanedDate = $lastFanCleanLog ? Carbon::parse($lastFanCleanLog->cleaned_at) : Carbon::today();
        $daysSinceClean = (int) $lastCleanedDate->diffInDays(Carbon::today());
        $daysRemaining = max(0, 10 - $daysSinceClean);
        $fanCleaningStatus = [
            'last_cleaned_at' => $lastCleanedDate->format('d M Y'),
            'days_since' => $daysSinceClean,
            'days_remaining' => $daysRemaining,
            'is_overdue' => $daysSinceClean >= 10,
            'is_approaching' => ($daysSinceClean >= 8 && $daysSinceClean < 10),
            'badge' => $daysSinceClean >= 10 ? '⚠️ ૧૦ દિવસ પૂરા (ફેન સાફ કરો)' : ($daysSinceClean >= 8 ? '🔔 ફેન ક્લિનિંગ નજીક છે' : '✅ ફેન ક્લિનિંગ ઓકે'),
            'title' => $daysSinceClean >= 10
                ? "ઇન્વર્ટર ફેન અને જાળી ક્લિનિંગ બાકી છે ({$daysSinceClean} દિવસ થયા)"
                : ($daysSinceClean >= 8
                    ? "ઇન્વર્ટર ફેન ક્લિનિંગ આગામી {$daysRemaining} દિવસમાં કરવું પડશે"
                    : "ઇન્વર્ટર કૂલિંગ ફેન અને જાળી ક્લિયર છે ({$daysRemaining} દિવસ બાકી)"),
            'message' => $daysSinceClean >= 10
                ? "ઇન્વર્ટર કૂલિંગ ફેન અને એર ફિલ્ટર જાળીને ૧૦ દિવસથી વધુ સમય થઈ ગયો છે. બ્લોઅરથી ધૂળ (Dust) તાત્કાલિક સાફ કરો જેથી ઇન્વર્ટર ગરમ ન થાય અને બળે નહીં."
                : "ઇન્વર્ટર ફેનની નિયમિત સફાઈ ૧૦-૧૦ દિવસે રાખવી જેથી ઇન્વર્ટરનું આયુષ્ય વધે અને પાવર લોસ ન થાય.",
            'theme' => $daysSinceClean >= 10 ? 'danger' : ($daysSinceClean >= 8 ? 'warning' : 'success'),
        ];

        // Time windows for predictions:
        $nextHour = $now->copy()->addHour();
        $startTimeStr = $now->format('h:i A');
        $endTimeStr = $nextHour->format('h:i A');
        $dateStr = $now->format('d M Y');
        $timeWindowStr = $isNight ? 'Sunrise (~06:30 AM)' : "{$startTimeStr} - {$endTimeStr}";
        $timeWindowFull = $isNight ? 'Next Generation at Sunrise (~06:30 AM)' : "{$dateStr}, {$startTimeStr} to {$endTimeStr}";
        $eodTargetTime = "{$dateStr}, 06:30 PM (Sunset)";

        return [
            'live' => $isLive,
            'status' => 'Normal',
            'last_updated' => Carbon::now()->format('d M Y, h:i:s A'),
            'weather' => $weatherData,
            'plant_location' => $plantLoc,
            'latitude' => $lat,
            'longitude' => $lon,
            'unit_rate' => $unitRate,
            'total_revenue_rs' => number_format($totalRevenueRs, 2, '.', ''),
            'system_alerts' => [
                'grid_outage' => $gridOutageAlert,
                'curtailment_reminders' => $curtailmentReminders,
                'daily_reading_status' => $todayReadingStatus,
                'past_reading_missing' => $pastReadingMissingAlert,
                'fan_cleaning' => $fanCleaningStatus,
                'overheat_alerts' => array_values(array_filter($allCleaningAlerts, fn($a) => ($a['type'] ?? '') === 'inverter_overheat')),
            ],
            'fan_cleaning_status' => $fanCleaningStatus,
            'predictions' => [
                'next_1h_kwh' => number_format($predictedNextHourKwh, 2, '.', ''),
                'eod_units_kwh' => number_format($predictedEodKwh, 2, '.', ''),
                'start_time' => $startTimeStr,
                'end_time' => $endTimeStr,
                'date' => $dateStr,
                'time_window' => $timeWindowStr,
                'time_window_full' => $timeWindowFull,
                'eod_target_time' => $eodTargetTime,
                'irradiance_w_m2' => round($irradianceNow, 0),
                'sun_hours_left' => round($remainingSunHours, 1),
                'companies' => $companyPredictions,
                'hourly_forecast' => $remainingHoursProfile,
                'heat_loss_kw' => $heatLossKw,
                'heat_loss_pct' => $heatLossPct,
            ],
            'cleaning_system' => [
                'is_window_active' => $isSoilingWindowActive,
                'window_hours' => '10:30 AM - 04:00 PM',
                'irradiance_w_m2' => round($irradianceNow, 0),
                'min_irradiance_threshold' => 600,
                'is_irradiance_sufficient' => $isIrradianceSufficient,
                'alerts_count' => count($allCleaningAlerts),
                'alerts' => $allCleaningAlerts,
                'washing_advice' => $weatherData['washing_advice'] ?? null,
            ],
            'smart_insights' => [
                'underperforming_inverters' => $underperformingInverters,
                'cloud_vs_fault' => $cloudVsFault,
                'grid_downtime' => $gridDowntimeTracker,
                'cleaning_roi' => null,
            ],
            'curtailment_system' => [
                'is_any_active' => $activeCurtailments->isNotEmpty(),
                'active_count' => $activeCurtailments->count(),
                'active_list' => $activeCurtailments->map(function ($c) use ($now, $unitRate) {
                    $startedAt = $c->started_at ?: $now;
                    $durationMinutes = max(1, (int) round($startedAt->diffInMinutes($now)));
                    $companyCapacityKw = (float) ($c->company?->total_capacity_kw ?? 500.0);
                    $percentage = (int) $c->percentage;
                    $lostKwh = round(($companyCapacityKw * ($percentage / 100.0) * ($durationMinutes / 60.0) * 0.75), 1);
                    $lostRevenueRs = round($lostKwh * $unitRate, 2);

                    $invNames = [];
                    if ($c->company && $c->company->inverters) {
                        $invMap = $c->company->inverters->keyBy('id');
                        foreach ((array) ($c->inverter_ids ?? []) as $iId) {
                            if (isset($invMap[$iId])) {
                                $invNames[] = $invMap[$iId]->name;
                            }
                        }
                    }

                    return [
                        'id' => $c->id,
                        'company_id' => $c->company_id,
                        'company_name' => $c->company?->name ?? 'Solar Company',
                        'percentage' => $percentage,
                        'inverter_ids' => $c->inverter_ids ?? [],
                        'inverter_names' => $invNames,
                        'pv_strings' => $c->pv_strings ?? [],
                        'step_history' => $c->step_history ?? [],
                        'started_at_human' => $c->started_at?->format('h:i A'),
                        'duration_minutes' => $durationMinutes,
                        'duration_human' => $durationMinutes < 60 ? "{$durationMinutes} મિનિટ" : floor($durationMinutes / 60) . " કલાક " . ($durationMinutes % 60) . " મિનિટ",
                        'lost_kwh' => $lostKwh,
                        'lost_revenue_rs' => $lostRevenueRs,
                        'user_name' => $c->user?->name ?? 'System',
                    ];
                })->values(),
            ],
            'realtime_power_mw' => number_format($realtimePowerMw, 2, '.', ''),
            'realtime_power_kw' => number_format($totalLiveKw, 2, '.', ''),
            'today_units_kwh' => number_format($totalTodayKwh, 2, '.', ''),
            'installed_capacity_mwp' => '3.00 MWp',
            'online_count' => $totalOnline,
            'total_inverters' => $totalInverters,
            'companies' => $companiesData,
        ];
    }
}


