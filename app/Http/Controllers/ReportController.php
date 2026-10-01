<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReportRequest;
use App\Services\ExcelReportExporter;
use App\Services\ReportService;
use App\Services\SolarAccessService;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;

class ReportController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly ReportService $reports,
        private readonly ExcelReportExporter $excel,
    ) {}

    public function show(ReportRequest $request): array
    {
        return $this->payload($request);
    }

    public function excel(ReportRequest $request)
    {
        $data = $this->payload($request);
        $path = $this->excel->create($data);

        return response()->download($path, 'solarflow-'.$data['period'].'-'.$data['from'].'-'.$data['to'].'.xlsx')->deleteFileAfterSend(true);
    }

    public function pdf(ReportRequest $request)
    {
        $data = $this->payload($request);

        return Pdf::loadView('reports.solar', ['report' => $data])
            ->setPaper('a4', 'landscape')
            ->download('solarflow-'.$data['period'].'-'.$data['from'].'-'.$data['to'].'.pdf');
    }

    private function payload(ReportRequest $request): array
    {
        $this->access->requirePermission($request, 'view_reports');
        $request->validated();
        $companyId = $this->access->requestedCompany($request, true);
        $period = $request->input('period', 'daily');
        $from = $request->filled('date_from') ? Carbon::parse($request->input('date_from')) : now()->startOfMonth();
        $to = $request->filled('date_to') ? Carbon::parse($request->input('date_to')) : now()->endOfMonth();

        return $this->reports->build($companyId, $period, $from, $to);
    }
}
