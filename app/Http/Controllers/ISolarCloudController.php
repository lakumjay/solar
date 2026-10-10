<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Inverter;
use App\Services\ActivityLogger;
use App\Services\ISolarCloudService;
use App\Services\SolarAccessService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ISolarCloudController extends Controller
{
    public function __construct(
        private readonly ISolarCloudService $solarCloud,
        private readonly SolarAccessService $access,
        private readonly ActivityLogger $activity,
    ) {}

    /**
     * Public OAuth callback handler.
     * When iSolarCloud redirects back with ?code=XXXX.
     */
    public function callback(Request $request)
    {
        $code = $request->query('code') ?: $request->input('code');

        if (! $code) {
            $error = $request->query('error_description') ?: $request->query('error') ?: 'Authorization code missing.';
            Log::warning('iSolarCloud callback error', ['query' => $request->query()]);

            if ($request->wantsJson()) {
                return response()->json(['error' => $error], 400);
            }

            return redirect('/?isolarcloud_error=' . urlencode($error));
        }

        try {
            $result = $this->solarCloud->exchangeCode($code);

            if ($request->wantsJson()) {
                return response()->json([
                    'success' => true,
                    'message' => 'iSolarCloud connected successfully!',
                    'data' => $result,
                ]);
            }

            return redirect('/?isolarcloud=connected');
        } catch (Exception $e) {
            Log::error('iSolarCloud token exchange failed', ['error' => $e->getMessage()]);

            if ($request->wantsJson()) {
                return response()->json(['error' => $e->getMessage()], 500);
            }

            return redirect('/?isolarcloud_error=' . urlencode($e->getMessage()));
        }
    }

    /**
     * Get connection status and configuration.
     */
    public function status(Request $request)
    {
        return response()->json($this->solarCloud->getConnectionStatus());
    }

    /**
     * Get OAuth authorization URL.
     */
    public function authUrl(Request $request)
    {
        return response()->json([
            'auth_url' => $this->solarCloud->getAuthUrl(),
        ]);
    }

    /**
     * Manually provide an authorization code or direct access token.
     */
    public function manualToken(Request $request)
    {
        $this->access->requireSuperAdmin($request);

        $request->validate([
            'code' => ['nullable', 'string'],
            'access_token' => ['nullable', 'string'],
            'refresh_token' => ['nullable', 'string'],
            'expires_in' => ['nullable', 'integer'],
        ]);

        try {
            if ($request->filled('code')) {
                $result = $this->solarCloud->exchangeCode($request->input('code'));
                $this->activity->log($request->user(), null, 'connected', 'isolarcloud', 0, 'iSolarCloud OAuth connected via code', []);
                return response()->json([
                    'success' => true,
                    'message' => 'Token exchanged and saved successfully!',
                    'status' => $this->solarCloud->getConnectionStatus(),
                ]);
            }

            if ($request->filled('access_token')) {
                $token = $this->solarCloud->saveTokenData([
                    'access_token' => $request->input('access_token'),
                    'refresh_token' => $request->input('refresh_token'),
                    'expires_in' => $request->input('expires_in') ?? 169400,
                    'token_type' => 'bearer',
                ]);

                $this->activity->log($request->user(), null, 'updated', 'isolarcloud', 0, 'iSolarCloud manual token saved', []);
                return response()->json([
                    'success' => true,
                    'message' => 'Access token saved successfully!',
                    'status' => $this->solarCloud->getConnectionStatus(),
                ]);
            }

            return response()->json(['error' => 'Please provide either a code or access_token.'], 422);
        } catch (Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Fetch live device status from iSolarCloud for a company or list of SNs.
     */
    public function liveData(Request $request)
    {
        $companyId = $request->query('company_id');
        $query = Inverter::with('company:id,name')->where('active', true)->whereNotNull('serial_number');

        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        $inverters = $query->get();
        if ($inverters->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'No active inverters with serial numbers found.',
                'devices' => [],
            ]);
        }

        try {
            $snList = $inverters->pluck('serial_number')->unique()->all();
            $pointIds = config('isolarcloud.default_point_ids', ['1', '3']);
            $data = $this->solarCloud->getDeviceRealTimeData($snList, $pointIds);

            $devicePointList = $data['result_data']['device_point_list'] ?? $data['device_point_list'] ?? [];
            $pointDict = $data['result_data']['point_dict'] ?? $data['point_dict'] ?? [];

            $snMap = [];
            foreach ($devicePointList as $item) {
                $dp = $item['device_point'] ?? $item;
                if (! empty($dp['device_sn'])) {
                    $snMap[$dp['device_sn']] = $dp;
                }
            }

            $results = $inverters->map(function ($inv) use ($snMap) {
                $dp = $snMap[$inv->serial_number] ?? null;
                return [
                    'inverter_id' => $inv->id,
                    'inverter_name' => $inv->name,
                    'company_name' => $inv->company?->name,
                    'serial_number' => $inv->serial_number,
                    'device_name' => $dp['device_name'] ?? null,
                    'dev_status' => $dp['dev_status'] ?? 0,
                    'p1' => $dp['p1'] ?? null,
                    'p3' => $dp['p3'] ?? null,
                    'raw' => $dp,
                ];
            });

            return response()->json([
                'success' => true,
                'devices' => $results,
                'point_dict' => $pointDict,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * Sync daily generation for DailyEntryPage.
     */
    public function sync(Request $request)
    {
        $request->validate([
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'date' => ['required', 'date'],
        ]);

        $this->access->requireCompany($request, (int) $request->input('company_id'));
        $this->access->requirePermission($request, 'enter_readings');

        try {
            $syncData = $this->solarCloud->syncDailyGeneration(
                (int) $request->input('company_id'),
                (string) $request->input('date')
            );

            return response()->json($syncData);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * Aggregated live solar overview for the Dashboard.
     */
    public function liveDashboard(Request $request)
    {
        $user = $request->user();
        $requestedCompanyId = $request->query('company_id');

        // Role-based scoping:
        // Super Admin and shared employees (without single company restriction) can see all companies or requested filter.
        // Single-company users are strictly restricted to their own assigned company.
        if ($user && $user->role !== 'super_admin' && ! empty($user->company_id)) {
            $companyId = (string) $user->company_id;
        } else {
            $companyId = $requestedCompanyId;
        }

        $overview = $this->solarCloud->getDashboardSolarOverview($companyId);
        
        // Cache for Voice Agent instant zero-latency memory (no redundant iSolarCloud API calls)
        try {
            if ($overview) {
                \Illuminate\Support\Facades\Cache::put('dashboard_solar_overview_all', $overview, 120);
                if ($companyId) {
                    \Illuminate\Support\Facades\Cache::put("dashboard_solar_overview_{$companyId}", $overview, 120);
                }
            }
        try {
            $activeEmergencyCall = \Illuminate\Support\Facades\Cache::get('active_emergency_call_super_admin');
            if ($activeEmergencyCall && is_array($overview)) {
                $overview['emergency_call'] = $activeEmergencyCall;
            }
        } catch (\Throwable $e) {}

        return response()->json($overview);
    }

    /**
     * Update common plant location (City, Latitude, Longitude) for all plants.
     */
    public function updatePlantLocation(Request $request)
    {
        $user = $request->user();
        abort_unless($user && in_array($user->role, ['super_admin', 'company_admin', 'manager'], true), 403, 'Unauthorized to update plant location.');

        $request->validate([
            'plant_location' => ['required', 'string', 'max:150'],
            'latitude' => ['nullable'],
            'longitude' => ['nullable'],
        ]);

        $locationName = trim($request->input('plant_location'));
        $lat = $request->filled('latitude') ? (float) $request->input('latitude') : null;
        $lon = $request->filled('longitude') ? (float) $request->input('longitude') : null;

        // Auto-geocode if coordinates not provided or if standard city matching
        if ($lat === null || $lon === null || ($lat == 0.0 && $lon == 0.0)) {
            $locLower = strtolower($locationName);
            if (str_contains($locLower, 'sarva') || str_contains($locLower, 'botad')) {
                $lat = 22.1704;
                $lon = 71.6684;
            } elseif (str_contains($locLower, 'rajkot')) {
                $lat = 22.3039;
                $lon = 70.8022;
            } elseif (str_contains($locLower, 'ahmedabad')) {
                $lat = 23.0225;
                $lon = 72.5714;
            } elseif (str_contains($locLower, 'surat')) {
                $lat = 21.1702;
                $lon = 72.8311;
            } elseif (str_contains($locLower, 'bhavnagar')) {
                $lat = 21.7645;
                $lon = 72.1519;
            } elseif (str_contains($locLower, 'vadodara')) {
                $lat = 22.3072;
                $lon = 73.1812;
            } elseif (str_contains($locLower, 'amreli')) {
                $lat = 21.6032;
                $lon = 71.2221;
            } elseif (str_contains($locLower, 'surendranagar')) {
                $lat = 22.7284;
                $lon = 71.6371;
            } elseif (str_contains($locLower, 'gadhada')) {
                $lat = 21.9700;
                $lon = 71.5800;
            } else {
                // Try live Open-Meteo geocoding search
                try {
                    $searchQuery = explode(',', $locationName)[0];
                    $geoRes = \Illuminate\Support\Facades\Http::timeout(3)
                        ->get('https://geocoding-api.open-meteo.com/v1/search', [
                            'name' => trim($searchQuery),
                            'count' => 1,
                            'language' => 'en',
                            'format' => 'json',
                        ]);
                    if ($geoRes->successful() && ! empty($geoRes->json('results.0'))) {
                        $firstResult = $geoRes->json('results.0');
                        $lat = round((float) $firstResult['latitude'], 6);
                        $lon = round((float) $firstResult['longitude'], 6);
                    }
                } catch (\Throwable $t) {
                    // Fallback to previous default
                }
            }
        }

        // Final fallback if still null
        if ($lat === null || $lon === null) {
            $lat = 22.1704;
            $lon = 71.6684;
        }

        Company::query()->update([
            'plant_location' => $locationName,
            'latitude' => $lat,
            'longitude' => $lon,
        ]);

        $this->activity->log(
            $user,
            null,
            'updated',
            'company',
            0,
            "Common plant location updated to {$locationName} ({$lat}, {$lon})",
            ['plant_location' => $locationName, 'latitude' => $lat, 'longitude' => $lon]
        );

        return response()->json([
            'success' => true,
            'message' => 'Plant location updated successfully for all plants.',
            'plant_location' => $locationName,
            'latitude' => $lat,
            'longitude' => $lon,
        ]);
    }

    /**
     * Record Inverter Fan & Filter Dust Cleaning (10-day cycle).
     */
    public function recordFanCleaned(Request $request)
    {
        $user = $request->user();
        $companyId = $request->input('company_id');
        $inverterId = $request->input('inverter_id');
        $notes = $request->input('notes');

        $log = \App\Models\InverterMaintenanceLog::create([
            'company_id' => $companyId ?: null,
            'inverter_id' => $inverterId ?: null,
            'user_id' => $user?->id,
            'maintenance_type' => 'fan_dust_cleaning',
            'cleaned_at' => now(),
            'next_due_date' => now()->addDays(10)->toDateString(),
            'performed_by_name' => $user?->name ?: 'Staff',
            'notes' => $notes ?: 'કૂલિંગ ફેન અને ફિલ્ટર જાળી બ્લોઅર વડે સાફ કરવામાં આવી.',
        ]);

        $this->activity->log(
            $user,
            $companyId ? (int) $companyId : null,
            'created',
            'inverter_maintenance',
            $log->id,
            "ઇન્વર્ટર ફેન અને જાળી ક્લિનિંગ નોંધાયું (૧૦ દિવસનું નવું સાઇકલ શરૂ થયું)",
            ['cleaned_at' => $log->cleaned_at, 'performed_by' => $log->performed_by_name]
        );

        return response()->json([
            'success' => true,
            'message' => 'ઇન્વર્ટર ફેન ક્લિનિંગ સફળતાપૂર્વક નોંધાઈ ગયું! નવું ૧૦ દિવસનું સાઇકલ શરૂ થયું છે.',
            'log' => $log,
        ]);
    }
}
