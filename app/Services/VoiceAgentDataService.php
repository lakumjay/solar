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

        $query = DailyReading::query()->with(['outputs', 'company:id,name']);

        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        if ($date) {
            $formattedDate = Carbon::parse($date)->toDateString();
            $query->whereDate('reading_date', $formattedDate);
            $readings = $query->get();

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
                    'inverter_generation_units' => round($gen, 2),
                    'plant_export_units' => round((float)$r->plant_export_unit, 2),
                    'plant_import_units' => round((float)$r->plant_import_unit, 2),
                ];
            }

            return [
                'authorized' => true,
                'query_type' => 'specific_date',
                'date' => $formattedDate,
                'total_generation_units' => round($totalGeneration, 2),
                'total_export_units' => round($totalPlantExport, 2),
                'total_import_units' => round($totalPlantImport, 2),
                'breakdown' => $companiesData,
            ];
        }

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

            return [
                'authorized' => true,
                'query_type' => 'month',
                'month' => $monthNum,
                'year' => $year,
                'total_generation_units' => round($totalGen, 2),
                'total_export_units' => round($totalExport, 2),
                'total_import_units' => round($totalImport, 2),
                'company_totals' => array_map(fn($k, $v) => [
                    'company' => $k,
                    'generation' => round($v['generation'], 2),
                    'export' => round($v['export'], 2),
                    'import' => round($v['import'], 2),
                ], array_keys($companyTotals), $companyTotals),
            ];
        }

        // Default: Total all-time or recent summary
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
        ];
    }

    private function compareMonths(?int $companyId, array $params): array
    {
        $month1 = (int)($params['month1'] ?? 4);
        $month2 = (int)($params['month2'] ?? 5);
        $year = (int)($params['year'] ?? date('Y'));

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
            return ['generation' => round($gen, 2), 'export' => round($exp, 2)];
        };

        $dataM1 = $getUnitsForMonth($month1);
        $dataM2 = $getUnitsForMonth($month2);

        $diffGen = round($dataM2['generation'] - $dataM1['generation'], 2);
        $diffExp = round($dataM2['export'] - $dataM1['export'], 2);

        $pctGen = $dataM1['generation'] > 0 ? round(($diffGen / $dataM1['generation']) * 100, 2) : 0;

        return [
            'authorized' => true,
            'month1' => ['month_number' => $month1, 'generation' => $dataM1['generation'], 'export' => $dataM1['export']],
            'month2' => ['month_number' => $month2, 'generation' => $dataM2['generation'], 'export' => $dataM2['export']],
            'difference_generation_units' => $diffGen,
            'difference_export_units' => $diffExp,
            'percentage_change' => $pctGen,
            'status' => $diffGen >= 0 ? "વધારો (Plus $diffGen units, +$pctGen%)" : "ઘટાડો (Minus " . abs($diffGen) . " units, $pctGen%)",
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
        $ratePerUnit = (float)($params['rate_per_unit'] ?? 2.84); // Default solar PPA/unit tariff estimate

        $start = Carbon::create($year, $month, 1)->startOfMonth();
        $end = Carbon::create($year, $month, 1)->endOfMonth();

        $query = DailyReading::query()->with(['outputs', 'company'])->whereBetween('reading_date', [$start, $end]);
        if ($companyId) $query->where('company_id', $companyId);
        $readings = $query->get();

        $totalExportUnits = $readings->sum('plant_export_unit');
        $totalEstimatedRevenue = round($totalExportUnits * $ratePerUnit, 2);

        return [
            'authorized' => true,
            'month' => $month,
            'year' => $year,
            'rate_per_unit_assumed' => $ratePerUnit,
            'total_export_units' => round($totalExportUnits, 2),
            'total_revenue_rs' => $totalEstimatedRevenue,
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

    private function getEmployeeAttendance(?User $user, ?int $companyId, array $params): array
    {
        $role = $user?->role ?? 'super_admin';
        if ($role === 'employee' && $user) {
            // Employee can only see own attendance
            $emp = Employee::where('user_id', $user->id)->first();
            if (!$emp) return ['authorized' => false, 'message' => 'કર્મચારી પ્રોફાઇલ મળેલ નથી.'];

            $todayRecord = AttendanceRecord::where('employee_id', $emp->id)
                ->whereDate('attendance_date', today())
                ->first();

            return [
                'authorized' => true,
                'employee_name' => $user->name,
                'today_clock_in' => $todayRecord?->clock_in_at?->format('h:i A') ?? 'પંચિંગ બાકી',
                'today_clock_out' => $todayRecord?->clock_out_at?->format('h:i A') ?? 'ચાલુ છે',
                'status' => $todayRecord ? $todayRecord->status : 'ગેરહાજર / પંચિંગ નથી થયું',
            ];
        }

        // Admins & Managers can see all or company-wise attendance
        $today = today();
        $employees = Employee::with(['user.company', 'attendanceRecords' => fn($q) => $q->whereDate('attendance_date', $today)])
            ->where('active', true)
            ->when($companyId, fn($q) => $q->whereHas('user', fn($u) => $u->where('company_id', $companyId)))
            ->get();

        $presentList = [];
        $absentList = [];

        foreach ($employees as $emp) {
            $rec = $emp->attendanceRecords->first();
            $empInfo = [
                'name' => $emp->user?->name ?? 'કર્મચારી',
                'company' => $emp->user?->company?->name,
                'clock_in_time' => $rec?->clock_in_at?->format('h:i A') ?? null,
                'status' => $rec?->status ?? 'ગેરહાજર',
            ];

            if ($rec && $rec->clock_in_at) {
                $presentList[] = $empInfo;
            } else {
                $absentList[] = $empInfo;
            }
        }

        return [
            'authorized' => true,
            'date' => $today->toDateString(),
            'total_employees' => $employees->count(),
            'present_count' => count($presentList),
            'absent_count' => count($absentList),
            'present_employees' => $presentList,
            'absent_employees' => $absentList,
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
                'last_updated' => $loc->recorded_at?->diffForHumans(),
                'status_label' => $loc->status_label,
            ];
        }

        return [
            'authorized' => true,
            'active_tracked_count' => count($list),
            'employees' => $list,
        ];
    }

    private function getStockStatus(?User $user): array
    {
        $items = StockItem::where('active', true)->get();
        return [
            'authorized' => true,
            'total_items_types' => $items->count(),
            'stock_list' => $items->map(fn($item) => [
                'name' => $item->name,
                'available_quantity' => (float)$item->total_quantity,
                'unit_price' => (float)$item->unit_price,
                'is_low_stock' => (float)$item->total_quantity <= (float)$item->low_stock_threshold,
            ]),
        ];
    }

    private function getSystemOverview(?User $user, ?int $companyId): array
    {
        $companies = Company::where('active', true)->when($companyId, fn($q) => $q->where('id', $companyId))->pluck('name')->all();
        return [
            'authorized' => true,
            'system_name' => 'SolarFlow Management System',
            'created_by' => 'Jay Sir',
            'user' => [
                'name' => $user?->name ?? 'User',
                'role' => $user?->role ?? 'super_admin',
                'company' => $user?->company?->name ?? 'All Companies',
            ],
            'active_companies' => $companies,
            'overview' => 'તમે SolarFlow AI સાથે વાત કરી રહ્યા છો. તમે સોલાર જનરેશન, તારીખ મુજબ યુનિટ્સ, મહિનાઓની સરખામણી, ઇન્વર્ટર અને મીટર ડિફરન્સ, આવક, શેર્ડ ખર્ચા, કર્મચારી હાજરી અને લાઈવ લોકેશન વિશે પૂછી શકો છો.',
        ];
    }
}
