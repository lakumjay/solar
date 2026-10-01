<?php

namespace App\Http\Controllers;

use App\Services\AttendanceExcelExporter;
use App\Services\AttendanceReportService;
use App\Services\SolarAccessService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;

class AttendanceReportController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly AttendanceReportService $reports,
        private readonly AttendanceExcelExporter $excel,
    ) {}

    public function show(Request $request): array
    {
        return $this->payload($request);
    }

    public function excel(Request $request)
    {
        $report = $this->payload($request);

        return response()->download($this->excel->create($report), 'attendance-'.$report['month'].'.xlsx')->deleteFileAfterSend(true);
    }

    public function pdf(Request $request)
    {
        $report = $this->payload($request);

        return Pdf::loadView('reports.attendance', compact('report'))->setPaper('a4', 'landscape')->download('attendance-'.$report['month'].'.pdf');
    }

    private function payload(Request $request): array
    {
        $this->access->requirePermission($request, 'view_attendance_reports');
        $validated = $request->validate(['month' => ['required', 'date_format:Y-m'], 'employee_id' => ['nullable', 'integer', 'exists:employees,id']]);

        return $this->reports->build($validated['month'], $validated['employee_id'] ?? null);
    }
}
