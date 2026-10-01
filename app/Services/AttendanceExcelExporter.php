<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class AttendanceExcelExporter
{
    public function create(array $report): string
    {
        $book = new Spreadsheet;
        $summary = $book->getActiveSheet();
        $summary->setTitle('Monthly Summary');
        $headers = ['Employee Code', 'Employee', 'Present', 'Half Days', 'Short Days', 'Absent', 'Leave', 'Holidays', 'Weekly Offs', 'Late', 'Early Out', 'Missing Time Out', 'Manual Corrections', 'Work Hours', 'Break Hours', 'Overtime Hours'];
        $summary->fromArray($headers, null, 'A1');
        $row = 2;
        foreach ($report['rows'] as $item) {
            $s = $item['summary'];
            $summary->fromArray([$item['employee']->employee_code, $item['employee']->user->name, $s['present'], $s['half_days'], $s['short_days'], $s['absent'], $s['leave'], $s['holidays'], $s['weekly_offs'], $s['late'], $s['early_out'], $s['missing_clock_out'], $s['manual_corrections'], round($s['work_minutes'] / 60, 2), round($s['break_minutes'] / 60, 2), round($s['overtime_minutes'] / 60, 2)], null, 'A'.$row++);
        }
        $this->header($summary, 'A1:P1');
        foreach (range('A', 'P') as $column) {
            $summary->getColumnDimension($column)->setAutoSize(true);
        }
        $summary->freezePane('A2');

        $daily = $book->createSheet();
        $daily->setTitle('Daily Details');
        $daily->fromArray(['Employee Code', 'Employee', 'Date', 'Status', 'Time In', 'Time Out', 'Work Hours', 'Break Hours', 'Entry Source', 'Recorded By', 'Entry Reason', 'Work Done', 'Learned'], null, 'A1');
        $dailyRow = 2;
        foreach ($report['rows'] as $item) {
            foreach ($item['days'] as $day) {
                $daily->fromArray([$item['employee']->employee_code, $item['employee']->user->name, $day['date'], str_replace('_', ' ', $day['status']), $day['clock_in'], $day['clock_out'], round($day['work_minutes'] / 60, 2), round($day['break_minutes'] / 60, 2), $day['entry_source'] === 'manager' ? 'Manager entered' : ($day['entry_source'] ? 'Employee' : ''), $day['recorded_by'], $day['entry_reason'], $day['work_done'], $day['learned']], null, 'A'.$dailyRow++);
            }
        }
        $this->header($daily, 'A1:M1');
        foreach (range('A', 'M') as $column) {
            $daily->getColumnDimension($column)->setAutoSize(true);
        }
        $daily->freezePane('A2');
        $book->setActiveSheetIndex(0);
        $path = sys_get_temp_dir().'/attendance-'.$report['month'].'-'.bin2hex(random_bytes(8)).'.xlsx';
        (new Xlsx($book))->save($path);
        $book->disconnectWorksheets();

        return $path;
    }

    private function header($sheet, string $range): void
    {
        $sheet->getStyle($range)->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($range)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('2F7759');
    }
}
