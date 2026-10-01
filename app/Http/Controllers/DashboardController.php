<?php

namespace App\Http\Controllers;

use App\Models\DailyReading;
use App\Services\ReadingCalculationService;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly ReadingCalculationService $calculator,
    ) {}

    public function show(Request $request): array
    {
        $this->access->requirePermission($request, 'view_dashboard');
        $companyId = $this->access->requestedCompany($request, true);
        $base = DailyReading::query();
        if ($companyId) {
            $base->where('company_id', $companyId);
        }

        $reportDate = now()->subDay()->toDateString();
        $dayRows = (clone $base)->with('outputs')->whereDate('reading_date', $reportDate)->get();
        $monthRows = (clone $base)->with('outputs')->whereBetween('reading_date', [now()->startOfMonth(), now()->endOfMonth()])->get();
        $recent = (clone $base)->with(['outputs', 'company:id,name'])->latest('reading_date')->take(10)->get();

        return [
            'report_date' => $reportDate,
            'day' => $this->calculator->totals($dayRows),
            'month' => $this->calculator->totals($monthRows),
            'rows' => $recent,
            'is_combined' => ! $companyId,
        ];
    }
}
