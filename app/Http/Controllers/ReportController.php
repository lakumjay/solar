<?php

namespace App\Http\Controllers;

use App\Http\Requests\CompanyReportRequest;
use App\Http\Requests\ReportRequest;
use App\Models\Inverter;
use App\Services\CompanyWiseReportExporter;
use App\Services\CompanyWiseReportService;
use App\Services\DailySsReportExporter;
use App\Services\ExcelReportExporter;
use App\Services\ReportService;
use App\Services\SolarAccessService;
use App\Services\WeatherIssueReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;

class ReportController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly ReportService $reports,
        private readonly ExcelReportExporter $excel,
        private readonly DailySsReportExporter $dailySsExcel,
        private readonly CompanyWiseReportService $companyReports,
        private readonly CompanyWiseReportExporter $companyExcel,
        private readonly WeatherIssueReportService $weatherIssueReports,
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

    public function dailySsExcel(ReportRequest $request)
    {
        $this->access->requirePermission($request, 'view_reports');
        $request->validated();
        $from = $request->filled('date_from') ? Carbon::parse($request->input('date_from')) : now()->startOfMonth();
        $to = $request->filled('date_to') ? Carbon::parse($request->input('date_to')) : now()->endOfMonth();
        $report = $this->reports->dailySs($from, $to);

        return response()->download(
            $this->dailySsExcel->create($report),
            'daily-ss-report-'.$report['from'].'-'.$report['to'].'.xlsx'
        )->deleteFileAfterSend(true);
    }

    public function companyExcel(CompanyReportRequest $request)
    {
        $this->access->requirePermission($request, 'view_reports');
        $validated = $request->validated();
        $companyId = $this->access->requestedCompany($request);
        $inverterIds = collect($validated['inverter_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values();
        abort_unless(
            Inverter::where('company_id', $companyId)->whereIn('id', $inverterIds)->count() === $inverterIds->count(),
            422,
            'One or more selected inverters do not belong to the company.',
        );
        $report = $this->companyReports->build(
            $companyId,
            Carbon::parse($validated['date_from']),
            Carbon::parse($validated['date_to']),
            $inverterIds->all(),
            $validated['columns'] ?? [],
        );

        return response()->download(
            $this->companyExcel->create($report),
            'company-wise-report-'.str($report['company']['name'])->slug().'-'.$report['from'].'-'.$report['to'].'.xlsx'
        )->deleteFileAfterSend(true);
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

    public function weatherIssueReport(ReportRequest $request): array
    {
        $this->access->requirePermission($request, 'view_reports');
        $request->validated();
        $companyId = $this->access->requestedCompany($request, true);
        $from = $request->filled('date_from') ? Carbon::parse($request->input('date_from')) : now()->startOfMonth();
        $to = $request->filled('date_to') ? Carbon::parse($request->input('date_to')) : now()->endOfMonth();

        return $this->weatherIssueReports->build($companyId, $from, $to);
    }

    public function weatherIssuePdf(ReportRequest $request)
    {
        $this->access->requirePermission($request, 'view_reports');
        $request->validated();
        $companyId = $this->access->requestedCompany($request, true);
        $from = $request->filled('date_from') ? Carbon::parse($request->input('date_from')) : now()->startOfMonth();
        $to = $request->filled('date_to') ? Carbon::parse($request->input('date_to')) : now()->endOfMonth();
        $data = $this->weatherIssueReports->build($companyId, $from, $to);

        return Pdf::loadView('reports.weather_issue', ['report' => $data])
            ->setPaper('a4', 'portrait')
            ->download('weather-issue-report-'.$data['from'].'-'.$data['to'].'.pdf');
    }
}
