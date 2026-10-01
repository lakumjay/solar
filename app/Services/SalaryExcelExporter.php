<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class SalaryExcelExporter
{
    public function create(array $report): string
    {
        $book = new Spreadsheet;
        $summary = $book->getActiveSheet();
        $summary->setTitle('Salary Summary');
        $summary->fromArray([
            'Employee Code', 'Employee', 'Monthly Salary', 'Scheduled Units', 'Eligible Units', 'Present', 'Half Days',
            'Short Days', 'Absent', 'Approved Leave', 'Holidays', 'Weekly Offs', 'Prorated Gross', 'Leave Deduction',
            'Additions', 'Deductions', 'Final Payable', 'Status',
        ], null, 'A1');
        $row = 2;
        foreach ($report['rows'] as $item) {
            $attendance = $item['attendance'];
            $summary->fromArray([
                $item['employee']['employee_code'], $item['employee']['name'], $item['configured'] ? $item['monthly_salary'] : 'Not configured',
                $item['scheduled_units'], $item['eligible_units'], $attendance['present'], $attendance['half_days'], $attendance['short_days'],
                $attendance['absent'], $attendance['approved_leave'], $attendance['holidays'], $attendance['weekly_offs'],
                $item['prorated_gross'], $item['leave_deduction'], $item['additions'], $item['deductions'], $item['final_payable'],
                str_replace('_', ' ', $report['period_status']),
            ], null, 'A'.$row++);
        }
        $this->prepare($summary, 'A1:R1', 'R');

        $daily = $book->createSheet();
        $daily->setTitle('Attendance and Leave');
        $daily->fromArray(['Employee Code', 'Employee', 'Date', 'Attendance Status', 'Scheduled Units', 'Deductible Leave Units', 'Leave Part', 'Holiday', 'Weekly Off', 'Time In', 'Time Out'], null, 'A1');
        $dailyRow = 2;
        foreach ($report['rows'] as $item) {
            foreach ($item['days'] as $day) {
                $daily->fromArray([
                    $item['employee']['employee_code'], $item['employee']['name'], $day['date'], str_replace('_', ' ', $day['status']),
                    $day['scheduled_units'], $day['leave_units'], $day['leave_part'], $day['holiday'], $day['weekly_off'] ? 'Yes' : 'No',
                    $day['clock_in'], $day['clock_out'],
                ], null, 'A'.$dailyRow++);
            }
        }
        $this->prepare($daily, 'A1:K1', 'K');

        $adjustments = $book->createSheet();
        $adjustments->setTitle('Adjustments');
        $adjustments->fromArray(['Employee Code', 'Employee', 'Type', 'Amount', 'Reason', 'Recorded By', 'Recorded At', 'Status', 'Cancelled By', 'Cancellation Reason'], null, 'A1');
        $adjustmentRow = 2;
        foreach ($report['rows'] as $item) {
            foreach ($item['adjustments'] as $adjustment) {
                $adjustments->fromArray([
                    $item['employee']['employee_code'], $item['employee']['name'], $adjustment['type'], $adjustment['amount'],
                    $adjustment['reason'], $adjustment['created_by'], $adjustment['created_at'], $adjustment['cancelled'] ? 'Cancelled' : 'Active',
                    $adjustment['cancelled_by'], $adjustment['cancellation_reason'],
                ], null, 'A'.$adjustmentRow++);
            }
        }
        $this->prepare($adjustments, 'A1:J1', 'J');

        $book->setActiveSheetIndex(0);
        $path = sys_get_temp_dir().'/salary-'.$report['month'].'-'.bin2hex(random_bytes(8)).'.xlsx';
        (new Xlsx($book))->save($path);
        $book->disconnectWorksheets();

        return $path;
    }

    private function prepare($sheet, string $headerRange, string $lastColumn): void
    {
        $sheet->getStyle($headerRange)->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($headerRange)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('2F7759');
        foreach (range('A', $lastColumn) as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }
        $sheet->freezePane('A2');
        $sheet->setAutoFilter($headerRange);
    }
}
