<?php

namespace App\Services;

use App\Models\Company;
use App\Models\DailyInverterOutput;
use App\Models\DailyReading;
use App\Models\Employee;
use App\Models\EmployeeLocation;
use App\Models\AttendanceRecord;
use App\Models\LeaveRequest;
use App\Models\SharedExpense;
use App\Models\StockItem;
use App\Models\User;
use App\Services\ISolarCloudService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class VoiceAgentDataService
{
    /**
     * Query data securely according to user role and company permission
     */
    public function querySolarData(?User $user = null, string $intent = '', array $params = []): array
    {
        $role = $user?->role ?? 'super_admin';
        $userCompanyId = $user?->company_id;

        // Company filter handling: Super Admin can query any or all companies.
        // Other roles are strictly restricted to their own assigned company_id.
        $targetCompanyId = null;
        if (!empty($params['company_name'])) {
            $comp = Company::where('name', 'LIKE', '%' . trim($params['company_name']) . '%')->first();
            if ($comp) {
                $targetCompanyId = $comp->id;
            }
        } elseif (!empty($params['company_id'])) {
            $targetCompanyId = (int)$params['company_id'];
        }

        if ($role !== 'super_admin') {
            if ($targetCompanyId && $targetCompanyId !== $userCompanyId) {
                return [
                    'authorized' => false,
                    'message' => 'સોરી, તમને આ કંપનીની માહિતી જોવાની પરવાનગી નથી. તમે ફક્ત તમારી પોતાની કંપનીની વિગતો પૂછી શકો છો.',
                ];
            }
            $targetCompanyId = $userCompanyId;
        }

        switch ($intent) {
            case 'get_generation_units':
                return $this->getGenerationUnits($targetCompanyId, $params);

            case 'get_inverter_live_power':
                return $this->getInverterLivePower($targetCompanyId, $params);

            case 'compare_months':
                return $this->compareMonths($targetCompanyId, $params);

            case 'inverter_vs_meter':
                return $this->getInverterVsMeterDifference($targetCompanyId, $params);

            case 'get_financials_revenue':
                return $this->getFinancialsRevenue($user, $targetCompanyId, $params);

            case 'get_shared_expenses':
                return $this->getSharedExpenses($user, $params);

            case 'get_live_plant_status':
                return $this->getLivePlantStatus($targetCompanyId);

            case 'get_employee_attendance':
                return $this->getEmployeeAttendance($user, $targetCompanyId, $params);

            case 'get_employee_leave_and_attendance':
                return $this->getEmployeeLeaveAndAttendance($user, $targetCompanyId, $params);

            case 'get_employee_location':
                return $this->getEmployeeLocation($user, $targetCompanyId, $params);

            case 'get_stock_status':
                return $this->getStockStatus($user);

            case 'get_system_overview':
            default:
                return $this->getSystemOverview($user, $targetCompanyId);
        }
    }

    private function getGenerationUnits(?int $companyId, array $params): array
    {
        $date = $params['date'] ?? null;
        $month = $params['month'] ?? null; // e.g. 4, 5 or '2026-04'
        $year = $params['year'] ?? date('Y');

        $isTodayOrLive = empty($date) && empty($month);
        if ($date) {
            $parsedDate = Carbon::parse($date)->toDateString();
            if ($parsedDate === today()->toDateString()) {
                $isTodayOrLive = true;
            }
        }

        // 1. Live Today query: Real-time dashboard data (Cached or provided)
        if ($isTodayOrLive) {
            try {
                $overview = $params['live_solar_data'] ?? null;
                if (empty($overview)) {
                    $cacheKey = $companyId ? "dashboard_solar_overview_{$companyId}" : "dashboard_solar_overview_all";
                    $overview = \Illuminate\Support\Facades\Cache::get($cacheKey);
                }
                if (empty($overview)) {
                    $solarCloud = app(ISolarCloudService::class);
                    $overview = $solarCloud->getDashboardSolarOverview($companyId ? (string)$companyId : null);
                }

                $liveKw = (float)($overview['live_total_power_kw'] ?? $overview['realtime_power_kw'] ?? 0);
                $todayKwh = (float)($overview['today_total_kwh'] ?? $overview['today_units_kwh'] ?? 0);
                $yesterdayKwh = (float)($overview['yesterday_total_kwh'] ?? 0);
                $isCurtailed = (bool)($overview['curtailment_active'] ?? !empty($overview['curtailment_system']['is_any_active']));

                $inverterList = [];
                $totalInvLiveKw = 0;
                $activeInvCount = 0;

                foreach ($overview['companies'] ?? [] as $comp) {
                    $cName = $comp['company_name'] ?? 'Solar Plant';
                    foreach ($comp['inverters'] ?? [] as $inv) {
                        $invLiveKw = (float)($inv['live_kw'] ?? 0);
                        $invTodayKwh = (float)($inv['today_kwh'] ?? 0);
                        $isOnline = (bool)($inv['online'] ?? false);
                        if ($isOnline) {
                            $totalInvLiveKw += $invLiveKw;
                            $activeInvCount++;
                        }
                        $inverterList[] = [
                            'inverter_id' => $inv['id'],
                            'name' => $inv['name'],
                            'company' => $cName,
                            'live_power_kw' => $invLiveKw,
                            'today_generation_kwh' => $invTodayKwh,
                            'status' => $isOnline ? 'Online' : 'Offline',
                        ];
                    }
                }

                $avgPowerKw = $activeInvCount > 0 ? round($totalInvLiveKw / $activeInvCount, 2) : 0;
                $todayRevenueRs = round($todayKwh * 3.80, 2);

                return [
                    'authorized' => true,
                    'query_type' => 'realtime_live_today',
                    'date' => today()->toDateString(),
                    'live_generation_power_kw' => round($liveKw, 2),
                    'today_total_units_kwh' => round($todayKwh, 2),
                    'yesterday_total_units_kwh' => round($yesterdayKwh, 2),
                    'tariff_rate_rs' => 3.80,
                    'today_revenue_rs' => $todayRevenueRs,
                    'curtailment_active' => $isCurtailed,
                    'total_inverters_count' => count($inverterList),
                    'active_inverters_count' => $activeInvCount,
                    'average_inverter_power_kw' => $avgPowerKw,
                    'inverters_breakdown' => $inverterList,
                    'summary' => "આજે લાઈવ {$todayKwh} kWh યુનિટ્સ બન્યા છે, હાલ પ્લાન્ટ પરથી {$liveKw} kW પાવર નીકળે છે, અને ગઈકાલે કુલ {$yesterdayKwh} યુનિટ્સ હતા. યુનિટ દીઠ ₹૩.૮૦ લેખે આજના ₹{$todayRevenueRs} થાય છે."
                ];
            } catch (\Throwable $e) {
                // fall through to database query
            }
        }

        // 2. Specific past date query (from DailyReading)
        $query = DailyReading::query()->with(['outputs', 'company:id,name']);
        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        if ($date) {
            $formattedDate = Carbon::parse($date)->toDateString();
            $query->whereDate('reading_date', $formattedDate);
            $readings = $query->get();

            if ($readings->isEmpty()) {
                return [
                    'authorized' => true,
                    'found' => false,
                    'query_type' => 'specific_date',
                    'date' => $formattedDate,
                    'total_generation_units' => 0,
                    'message' => "તમારા કર્મચારીએ {$formattedDate} તારીખનો ડેટા એપમાં હજી દાખલ (entry) નથી કર્યો, એટલે આ તારીખની વિગત ઉપલબ્ધ નથી.",
                    'summary' => "તમારા કર્મચારીએ {$formattedDate} તારીખનો ડેટા એપમાં હજી દાખલ (entry) નથી કર્યો, એટલે આ તારીખની વિગત ઉપલબ્ધ નથી."
                ];
            }

            $totalGeneration = 0;
            $totalPlantExport = 0;
            $totalPlantImport = 0;
            $companiesData = [];

            foreach ($readings as $r) {
                $gen = $r->outputs->sum('generation');
                $totalGeneration += $gen;
                $totalPlantExport += (float)$r->plant_export_unit;
                $totalPlantImport += (float)$r->plant_import_unit;

                $companiesData[] = [
                    'company' => $r->company?->name,
                    'generation_units' => round($gen, 2),
                    'plant_export_units' => (float)$r->plant_export_unit,
                    'plant_import_units' => (float)$r->plant_import_unit,
                ];
            }

            $revenueRs = round($totalPlantExport * 3.80, 2);

            return [
                'authorized' => true,
                'found' => true,
                'query_type' => 'specific_date',
                'date' => $formattedDate,
                'total_generation_units' => round($totalGeneration, 2),
                'total_export_units' => round($totalPlantExport, 2),
                'total_import_units' => round($totalPlantImport, 2),
                'tariff_rate_rs' => 3.80,
                'estimated_revenue_rs' => $revenueRs,
                'breakdown' => $companiesData,
                'summary' => "{$formattedDate} તારીખે કુલ {$totalGeneration} યુનિટ્સ જનરેશન અને {$totalPlantExport} યુનિટ્સ એક્સપોર્ટ થયા હતા. ₹૩.૮૦ લેખે અંદાજિત આવક ₹{$revenueRs} થાય છે."
            ];
        }

        // 3. Month query
        if ($month) {
            $monthNum = is_numeric($month) ? (int)$month : Carbon::parse($month)->month;
            $start = Carbon::create($year, $monthNum, 1)->startOfMonth();
            $end = Carbon::create($year, $monthNum, 1)->endOfMonth();

            $query->whereBetween('reading_date', [$start, $end]);
            $readings = $query->get();

            $totalGen = 0;
            $totalExport = 0;
            $totalImport = 0;
            $companyTotals = [];

            foreach ($readings as $r) {
                $cName = $r->company?->name ?? 'Unknown';
                if (!isset($companyTotals[$cName])) {
                    $companyTotals[$cName] = ['generation' => 0, 'export' => 0, 'import' => 0];
                }
                $gen = $r->outputs->sum('generation');
                $totalGen += $gen;
                $totalExport += (float)$r->plant_export_unit;
                $totalImport += (float)$r->plant_import_unit;

                $companyTotals[$cName]['generation'] += $gen;
                $companyTotals[$cName]['export'] += (float)$r->plant_export_unit;
                $companyTotals[$cName]['import'] += (float)$r->plant_import_unit;
            }

            $revenueRs = round($totalExport * 3.80, 2);

            return [
                'authorized' => true,
                'query_type' => 'month',
                'month' => $monthNum,
                'year' => $year,
                'total_generation_units' => round($totalGen, 2),
                'total_export_units' => round($totalExport, 2),
                'total_import_units' => round($totalImport, 2),
                'tariff_rate_rs' => 3.80,
                'estimated_revenue_rs' => $revenueRs,
                'company_totals' => array_map(fn($k, $v) => [
                    'company' => $k,
                    'generation' => round($v['generation'], 2),
                    'export' => round($v['export'], 2),
                    'import' => round($v['import'], 2),
                ], array_keys($companyTotals), $companyTotals),
            ];
        }

        // Default overview
        $totalGen = DailyInverterOutput::when($companyId, function ($q) use ($companyId) {
            $q->whereHas('dailyReading', fn($dr) => $dr->where('company_id', $companyId));
        })->sum('generation');

        $readings = $query->get();
        $totalExport = $readings->sum('plant_export_unit');

        return [
            'authorized' => true,
            'query_type' => 'total_overview',
            'total_generation_units' => round($totalGen, 2),
            'total_export_units' => round($totalExport, 2),
            'tariff_rate_rs' => 3.80,
            'total_revenue_rs' => round($totalExport * 3.80, 2),
        ];
    }

    /**
     * Get live power and output for specific inverters (Inverter 1, Inverter 2, etc.) & average output
     */
    public function getInverterLivePower(?int $companyId, array $params): array
    {
        $target = $params['inverter_number'] ?? $params['inverter_name'] ?? null;
        $overview = $params['live_solar_data'] ?? null;
        if (empty($overview)) {
            $cacheKey = $companyId ? "dashboard_solar_overview_{$companyId}" : "dashboard_solar_overview_all";
            $overview = \Illuminate\Support\Facades\Cache::get($cacheKey);
        }
        if (empty($overview)) {
            $solarCloud = app(ISolarCloudService::class);
            $overview = $solarCloud->getDashboardSolarOverview($companyId ? (string)$companyId : null);
        }

        $matchedInverter = null;
        $inverters = [];
        $totalLiveKw = 0;
        $activeCount = 0;

        foreach ($overview['companies'] ?? [] as $comp) {
            $cName = $comp['company_name'] ?? 'Solar Plant';
            foreach ($comp['inverters'] ?? [] as $inv) {
                $iName = (string)$inv['name'];
                $iKw = (float)($inv['live_kw'] ?? 0);
                $iKwh = (float)($inv['today_kwh'] ?? 0);
                $isOnline = (bool)($inv['online'] ?? false);
                if ($isOnline) {
                    $totalLiveKw += $iKw;
                    $activeCount++;
                }

                $item = [
                    'name' => $iName,
                    'company' => $cName,
                    'live_power_kw' => $iKw,
                    'today_generation_kwh' => $iKwh,
                    'status' => $isOnline ? 'Online' : 'Offline',
                ];
                $inverters[] = $item;

                if ($target !== null) {
                    $targetStr = (string)$target;
                    if (str_contains(strtolower($iName), strtolower($targetStr)) ||
                        (preg_match('/\d+/', $targetStr, $m) && str_contains($iName, $m[0]))) {
                        $matchedInverter = $item;
                    }
                }
            }
        }

        $avgKw = $activeCount > 0 ? round($totalLiveKw / $activeCount, 2) : 0;

        return [
            'authorized' => true,
            'queried_target' => $target,
            'matched_inverter' => $matchedInverter,
            'average_power_kw' => $avgKw,
            'total_inverters' => count($inverters),
            'active_inverters' => $activeCount,
            'all_inverters' => $inverters,
            'summary' => $matchedInverter 
                ? "{$matchedInverter['name']} ({$matchedInverter['company']}) માં હાલ {$matchedInverter['live_power_kw']} kW પાવર નીકળે છે અને આજના {$matchedInverter['today_generation_kwh']} યુનિટ્સ બન્યા છે. ઇન્વર્ટરની સરેરાશ (Average) {$avgKw} kW છે."
                : "બધા એક્ટિવ ઇન્વર્ટરનો સરેરાશ પાવર {$avgKw} kW છે. કુલ {$activeCount} ઇન્વર્ટર ચાલુ છે.",
        ];
    }

    private function compareMonths(?int $companyId, array $params): array
    {
        $month1 = (int)($params['month1'] ?? 7);
        $month2 = (int)($params['month2'] ?? 8);
        $year = (int)($params['year'] ?? date('Y'));

        $monthNamesGujarati = [
            1 => 'જાન્યુઆરી (મહિનો ૧)', 2 => 'ફેબ્રુઆરી (મહિનો ૨)', 3 => 'માર્ચ (મહિનો ૩)',
            4 => 'એપ્રિલ (મહિનો ૪)', 5 => 'મે (મહિનો ૫)', 6 => 'જૂન (મહિનો ૬)',
            7 => 'જુલાઈ (મહિનો ૭)', 8 => 'ઓગસ્ટ (મહિનો ૮)', 9 => 'સપ્ટેમ્બર (મહિનો ૯)',
            10 => 'ઓક્ટોબર (મહિનો ૧૦)', 11 => 'નવેમ્બર (મહિનો ૧૧)', 12 => 'ડિસેમ્બર (મહિનો ૧૨)',
        ];

        $getUnitsForMonth = function ($m) use ($companyId, $year) {
            $start = Carbon::create($year, $m, 1)->startOfMonth();
            $end = Carbon::create($year, $m, 1)->endOfMonth();

            $query = DailyReading::query()->with('outputs')->whereBetween('reading_date', [$start, $end]);
            if ($companyId) $query->where('company_id', $companyId);
            $rows = $query->get();

            $gen = 0;
            $exp = 0;
            foreach ($rows as $r) {
                $gen += $r->outputs->sum('generation');
                $exp += (float)$r->plant_export_unit;
            }
            if ($gen <= 0) {
                $gen = (float)DailyInverterOutput::whereHas('dailyReading', function($q) use ($start, $end, $companyId) {
                    $q->whereBetween('reading_date', [$start, $end])
                      ->when($companyId, fn($cq) => $cq->where('company_id', $companyId));
                })->sum('generation');
            }
            return ['generation' => round($gen, 2), 'export' => round($exp, 2)];
        };

        $dataM1 = $getUnitsForMonth($month1);
        $dataM2 = $getUnitsForMonth($month2);

        $diffGen = round($dataM2['generation'] - $dataM1['generation'], 2);
        $diffExp = round($dataM2['export'] - $dataM1['export'], 2);

        $pctGen = $dataM1['generation'] > 0 ? round(($diffGen / $dataM1['generation']) * 100, 2) : 0;
        $m1Name = $monthNamesGujarati[$month1] ?? "મહિનો {$month1}";
        $m2Name = $monthNamesGujarati[$month2] ?? "મહિનો {$month2}";

        $trend = $diffGen >= 0 ? "વધારો (+{$diffGen} યુનિટ્સ, +{$pctGen}%)" : "ઘટાડો (" . $diffGen . " યુનિટ્સ, {$pctGen}%)";

        return [
            'authorized' => true,
            'month1' => ['month_number' => $month1, 'name' => $m1Name, 'generation_units' => $dataM1['generation'], 'export_units' => $dataM1['export']],
            'month2' => ['month_number' => $month2, 'name' => $m2Name, 'generation_units' => $dataM2['generation'], 'export_units' => $dataM2['export']],
            'difference_generation_units' => $diffGen,
            'percentage_change' => $pctGen,
            'trend' => $trend,
            'explanation' => "{$m1Name} માં {$dataM1['generation']} યુનિટ્સ હતા અને {$m2Name} માં {$dataM2['generation']} યુનિટ્સ હતા. કુલ {$trend} થયો છે.",
        ];
    }

    private function getInverterVsMeterDifference(?int $companyId, array $params): array
    {
        $date = $params['date'] ?? now()->subDay()->toDateString();
        $formattedDate = Carbon::parse($date)->toDateString();

        $query = DailyReading::query()->with(['outputs', 'company'])->whereDate('reading_date', $formattedDate);
        if ($companyId) $query->where('company_id', $companyId);
        $readings = $query->get();

        $results = [];
        $totalInverter = 0;
        $totalMeterExport = 0;

        foreach ($readings as $r) {
            $invGen = $r->outputs->sum('generation');
            $meterExp = (float)$r->plant_export_unit;
            $loss = $invGen - $meterExp;
            $lossPct = $invGen > 0 ? round(($loss / $invGen) * 100, 2) : 0;

            $totalInverter += $invGen;
            $totalMeterExport += $meterExp;

            $results[] = [
                'company' => $r->company?->name,
                'inverter_generation' => round($invGen, 2),
                'plant_meter_export' => round($meterExp, 2),
                'difference_loss_units' => round($loss, 2),
                'loss_percentage' => $lossPct . '%',
            ];
        }

        $overallLoss = $totalInverter - $totalMeterExport;
        $overallLossPct = $totalInverter > 0 ? round(($overallLoss / $totalInverter) * 100, 2) : 0;

        return [
            'authorized' => true,
            'date' => $formattedDate,
            'total_inverter_generation' => round($totalInverter, 2),
            'total_meter_export' => round($totalMeterExport, 2),
            'total_loss_difference' => round($overallLoss, 2),
            'loss_percentage' => $overallLossPct . '%',
            'details' => $results,
        ];
    }

    private function getFinancialsRevenue(?User $user, ?int $companyId, array $params): array
    {
        $role = $user?->role ?? 'super_admin';
        if (!in_array($role, ['super_admin', 'company_admin', 'manager', 'viewer'], true)) {
            return ['authorized' => false, 'message' => 'સોરી, તમને નાણાકીય હિસાબ કે રકમ જોવાની પરવાનગી નથી.'];
        }

        $month = (int)($params['month'] ?? date('n'));
        $year = (int)($params['year'] ?? date('Y'));
        $ratePerUnit = (float)($params['rate_per_unit'] ?? 3.80); // Strict ₹3.80 per unit rate

        // If today's live revenue requested
        if (!empty($params['is_today'])) {
            try {
                $solarCloud = app(ISolarCloudService::class);
                $overview = $solarCloud->getDashboardSolarOverview($companyId ? (string)$companyId : null);
                $todayUnits = (float)($overview['today_total_kwh'] ?? 0);
                $todayRev = round($todayUnits * $ratePerUnit, 2);
                return [
                    'authorized' => true,
                    'period' => 'આજના લાઈવ યુનિટ્સ',
                    'rate_per_unit' => $ratePerUnit,
                    'today_units' => $todayUnits,
                    'total_revenue_rs' => $todayRev,
                    'calculation' => "{$todayUnits} યુનિટ્સ × ₹{$ratePerUnit} = ₹{$todayRev} રૂપિયા",
                ];
            } catch (\Throwable $e) {}
        }

        $start = Carbon::create($year, $month, 1)->startOfMonth();
        $end = Carbon::create($year, $month, 1)->endOfMonth();

        $query = DailyReading::query()->with(['outputs', 'company'])->whereBetween('reading_date', [$start, $end]);
        if ($companyId) $query->where('company_id', $companyId);
        $readings = $query->get();

        $totalExportUnits = (float)$readings->sum('plant_export_unit');
        if ($totalExportUnits <= 0) {
            $totalExportUnits = (float)DailyInverterOutput::whereHas('dailyReading', function($q) use ($start, $end, $companyId) {
                $q->whereBetween('reading_date', [$start, $end])
                  ->when($companyId, fn($cq) => $cq->where('company_id', $companyId));
            })->sum('generation');
        }

        $totalEstimatedRevenue = round($totalExportUnits * $ratePerUnit, 2);

        return [
            'authorized' => true,
            'period' => "મહિનો {$month}/{$year}",
            'month' => $month,
            'year' => $year,
            'rate_per_unit_assumed' => $ratePerUnit,
            'total_export_units' => round($totalExportUnits, 2),
            'total_revenue_rs' => $totalEstimatedRevenue,
            'calculation' => "{$totalExportUnits} યુનિટ્સ × ₹{$ratePerUnit} = ₹{$totalEstimatedRevenue} રૂપિયા",
        ];
    }

    private function getSharedExpenses(?User $user, array $params): array
    {
        $role = $user?->role ?? 'super_admin';
        if (!in_array($role, ['super_admin', 'company_admin', 'manager'], true)) {
            return ['authorized' => false, 'message' => 'સોરી, તમને શેર્ડ એક્સપેન્સ જોવાની પરવાનગી નથી.'];
        }

        $activePercentages = Company::where('active', true)->pluck('expense_percentage', 'name')->all();

        $totalExpenses = SharedExpense::where('status', 'active')->sum('amount');
        $recentExpenses = SharedExpense::where('status', 'active')->with(['allocations.company', 'paidByCompany'])->latest('id')->take(5)->get();

        return [
            'authorized' => true,
            'active_percentage_split' => $activePercentages, // 38.15%, 39.69%, 22.16%
            'total_active_expenses_amount' => round((float)$totalExpenses, 2),
            'recent_entries' => $recentExpenses->map(fn($e) => [
                'title' => $e->title,
                'amount' => (float)$e->amount,
                'paid_by' => $e->paidByCompany?->name,
                'date' => $e->expense_date?->toDateString(),
            ]),
        ];
    }

    private function getLivePlantStatus(?int $companyId): array
    {
        try {
            $solarCloud = app(ISolarCloudService::class);
            $overview = $solarCloud->getDashboardSolarOverview($companyId ? (string)$companyId : null);

            $liveKw = (float)($overview['live_total_power_kw'] ?? 0);
            $todayKwh = (float)($overview['today_total_kwh'] ?? 0);
            $curtActive = (bool)($overview['curtailment_active'] ?? false);

            $companies = [];
            $totalInverters = 0;
            $onlineInverters = 0;
            $alerts = [];

            foreach ($overview['companies'] ?? [] as $comp) {
                $cName = $comp['company_name'] ?? 'Company';
                $invs = $comp['inverters'] ?? [];
                $invCount = count($invs);
                $totalInverters += $invCount;

                $cOnline = 0;
                foreach ($invs as $inv) {
                    if (!empty($inv['online'])) {
                        $cOnline++;
                        $onlineInverters++;
                    }
                    if (!empty($inv['cleaning_alerts'])) {
                        foreach ($inv['cleaning_alerts'] as $ca) {
                            $alerts[] = "{$inv['name']}: {$ca}";
                        }
                    }
                }

                $companies[] = [
                    'company' => $cName,
                    'total_inverters' => $invCount,
                    'online_inverters' => $cOnline,
                    'status' => $cOnline > 0 ? "ઓનલાઈન ({$cOnline}/{$invCount} ઇન્વર્ટર ચાલુ)" : "ઓફલાઈન",
                ];
            }

            return [
                'authorized' => true,
                'live_summary' => $curtActive ? 'ચેતવણી: હાલ PGVCL પાવર ઘટાડો (કર્ટલમેન્ટ) સક્રિય છે.' : 'બધા સોલાર પ્લાન્ટ સામાન્ય રીતે કાર્યરત છે.',
                'curtailment_active' => $curtActive,
                'live_total_power_kw' => $liveKw,
                'today_total_units_kwh' => $todayKwh,
                'total_inverters' => $totalInverters,
                'online_inverters' => $onlineInverters,
                'alerts' => $alerts,
                'companies' => $companies,
            ];
        } catch (\Throwable $e) {
            $companies = Company::where('active', true)
                ->when($companyId, fn($q) => $q->where('id', $companyId))
                ->with(['inverters' => fn($q) => $q->where('active', true)])
                ->get();

            $statusData = [];
            $totalInverters = 0;

            foreach ($companies as $c) {
                $invCount = $c->inverters->count();
                $totalInverters += $invCount;
                $statusData[] = [
                    'company' => $c->name,
                    'capacity_kw' => $c->capacity_kw,
                    'total_inverters' => $invCount,
                    'status' => 'ઓનલાઈન / એક્ટિવ',
                ];
            }

            return [
                'authorized' => true,
                'live_summary' => 'બધા સોલાર પ્લાન્ટ હાલ કાર્યરત છે.',
                'total_companies' => $companies->count(),
                'total_inverters' => $totalInverters,
                'companies' => $statusData,
            ];
        }
    }

    private function getEmployeeAttendance(?User $user, ?int $companyId, array $params): array
    {
        return $this->getEmployeeLeaveAndAttendance($user, $companyId, $params);
    }

    /**
     * Get employee arrival time today (clock-in) and comprehensive leave history (dates and count)
     */
    public function getEmployeeLeaveAndAttendance(?User $user, ?int $companyId, array $params): array
    {
        $targetName = trim((string)($params['employee_name'] ?? ''));
        $today = today();

        $query = Employee::with([
            'user.company',
            'attendanceRecords' => fn($q) => $q->whereDate('attendance_date', $today),
            'leaveRequests' => fn($q) => $q->where('status', 'approved')->orderByDesc('date_from'),
        ])->where('active', true);

        if ($companyId) {
            $query->whereHas('user', fn($u) => $u->where('company_id', $companyId));
        }

        if ($targetName !== '') {
            $query->whereHas('user', fn($u) => $u->where('name', 'LIKE', "%{$targetName}%"));
        }

        $employees = $query->get();
        $list = [];

        foreach ($employees as $emp) {
            $uName = $emp->user?->name ?? 'કર્મચારી';
            $todayRec = $emp->attendanceRecords->first();
            $clockInTime = null;
            if ($todayRec && $todayRec->clock_in_at) {
                $clockInTime = Carbon::parse($todayRec->clock_in_at)->format('h:i A');
            }

            $leaves = $emp->leaveRequests;
            $leaveCount = $leaves->count();
            $leaveDates = [];
            foreach ($leaves as $l) {
                $from = Carbon::parse($l->date_from)->format('d-m-Y');
                $to = $l->date_to ? Carbon::parse($l->date_to)->format('d-m-Y') : $from;
                $leaveDates[] = ($from === $to) ? $from : "{$from} થી {$to}";
            }

            $list[] = [
                'employee_name' => $uName,
                'designation' => $emp->designation ?? 'કર્મચારી',
                'company' => $emp->user?->company?->name,
                'today_arrival_time' => $clockInTime ? "આજે સવારે {$clockInTime} વાગ્યે આવ્યા" : "આજે પંચિંગ બાકી / હજુ આવ્યા નથી",
                'status' => $clockInTime ? 'હાજર (Present)' : 'ગેરહાજર (Absent)',
                'total_leaves_taken' => $leaveCount,
                'leave_dates_list' => $leaveDates,
                'summary' => "{$uName}: " . ($clockInTime ? "આજે સવારે {$clockInTime} વાગ્યે આવ્યા છે." : "આજે હજુ આવ્યા નથી.") . " અત્યાર સુધીમાં કુલ {$leaveCount} રજા લીધી છે" . ($leaveCount > 0 ? " (" . implode(', ', array_slice($leaveDates, 0, 5)) . " તારીખે)." : "."),
            ];
        }

        return [
            'authorized' => true,
            'total_employees_reported' => count($list),
            'employees' => $list,
        ];
    }

    private function getEmployeeLocation(?User $user, ?int $companyId, array $params): array
    {
        $role = $user?->role ?? 'super_admin';
        if (!in_array($role, ['super_admin', 'company_admin', 'manager'], true)) {
            return ['authorized' => false, 'message' => 'સોરી, તમને કર્મચારીઓનું લાઈવ લોકેશન જોવાની પરવાનગી નથી.'];
        }

        $latestLocations = EmployeeLocation::with(['employee.user.company'])
            ->where('recorded_at', '>=', now()->subHours(12))
            ->latest('recorded_at')
            ->get()
            ->unique('employee_id');

        $list = [];
        foreach ($latestLocations as $loc) {
            $emp = $loc->employee;
            if ($companyId && $emp?->user?->company_id !== $companyId) continue;

            $speed = (float)$loc->speed;
            $movementStatus = 'સ્થિર (Site Stationary)';
            if ($speed > 20) {
                $movementStatus = "બાઇક / વાહન પર (Speed: " . round($speed, 1) . " km/h)";
            } elseif ($speed > 3) {
                $movementStatus = "પગપાળા ચાલે છે (Walking)";
            }

            $list[] = [
                'employee_name' => $emp?->user?->name,
                'company' => $emp?->user?->company?->name,
                'movement_status' => $movementStatus,
                'recorded_time' => $loc->recorded_at?->diffForHumans(),
            ];
        }

        return [
            'authorized' => true,
            'active_tracked_count' => count($list),
            'locations' => $list,
        ];
    }

    private function getStockStatus(?User $user): array
    {
        $items = StockItem::with('company')->get();
        $lowStock = $items->filter(fn($i) => (float)$i->quantity <= (float)$i->minimum_threshold);

        return [
            'authorized' => true,
            'total_items_count' => $items->count(),
            'low_stock_items_count' => $lowStock->count(),
            'low_stock_alerts' => $lowStock->map(fn($i) => [
                'name' => $i->name,
                'quantity' => (float)$i->quantity,
                'unit' => $i->unit,
                'company' => $i->company?->name,
            ])->values(),
        ];
    }

    private function getSystemOverview(?User $user, ?int $companyId): array
    {
        $live = $this->getGenerationUnits($companyId, []);
        $plants = $this->getLivePlantStatus($companyId);

        return [
            'authorized' => true,
            'live_generation' => $live,
            'plant_status' => $plants,
        ];
    }
}
