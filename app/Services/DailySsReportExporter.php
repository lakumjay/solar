<?php

namespace App\Services;

use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class DailySsReportExporter
{
    private const COMPANY_NAME = 'Kashtabhajan Green Energy';

    public function create(array $report): string
    {
        $book = new Spreadsheet;
        $sheet = $book->getActiveSheet();
        $sheet->setTitle('Daily SS Report');
        $sheet->fromArray(['Date', 'Daily SS Reading'], null, 'A1');

        $rowNumber = 2;
        foreach ($report['rows'] as $row) {
            $sheet->setCellValue('A'.$rowNumber, Carbon::parse($row['date'])->format('d/m/Y'));
            $sheet->setCellValue('B'.$rowNumber, $row['daily_ss_reading']);
            $rowNumber++;
        }

        // Keep the fixed company panel beside the two-column report, as requested.
        $companyPanelLastRow = max($rowNumber - 1, 9);
        $sheet->mergeCells("C1:F{$companyPanelLastRow}");
        $sheet->setCellValue('C1', self::COMPANY_NAME);

        $sheet->getStyle('A1:B1')->getFont()->setBold(true);
        $sheet->getStyle('A1:B1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('FFFF00');
        $sheet->getStyle("C1:F{$companyPanelLastRow}")->getFont()->setBold(true)->setSize(16)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle("C1:F{$companyPanelLastRow}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('4A86E8');
        $sheet->getStyle("C1:F{$companyPanelLastRow}")->getAlignment()
            ->setHorizontal(Alignment::HORIZONTAL_CENTER)
            ->setVertical(Alignment::VERTICAL_CENTER)
            ->setWrapText(true);
        $sheet->getStyle("A1:B{$companyPanelLastRow}")->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_THIN)
            ->getColor()->setRGB('D9E2F3');
        $sheet->getStyle("B2:B{$rowNumber}")->getNumberFormat()->setFormatCode('#,##0.00');
        $sheet->getColumnDimension('A')->setWidth(15);
        $sheet->getColumnDimension('B')->setWidth(20);
        foreach (range('C', 'F') as $column) {
            $sheet->getColumnDimension($column)->setWidth(15);
        }
        $sheet->freezePane('A2');

        $infoSheet = $book->createSheet();
        $infoSheet->setTitle('Report Info');
        $infoSheet->fromArray([
            ['Field', 'Value'],
            ['Report period', $report['from'].' to '.$report['to']],
            ['Daily SS reference company', $report['ss_reference']['company']],
            ['Missing reference dates', $report['ss_reference']['missing_dates']
                ? implode(', ', $report['ss_reference']['missing_dates'])
                : 'None'],
        ], null, 'A1');
        $this->styleInfoSheet($infoSheet);

        $book->setActiveSheetIndex(0);

        $path = sys_get_temp_dir().'/daily-ss-report-'.bin2hex(random_bytes(8)).'.xlsx';
        (new Xlsx($book))->save($path);
        $book->disconnectWorksheets();

        return $path;
    }

    private function styleInfoSheet(Worksheet $sheet): void
    {
        $sheet->getStyle('A1:B1')->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle('A1:B1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('2F7759');
        $sheet->getStyle('A1:B4')->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN);
        $sheet->getStyle('A2:A4')->getFont()->setBold(true);
        $sheet->getColumnDimension('A')->setWidth(30);
        $sheet->getColumnDimension('B')->setWidth(65);
        $sheet->getStyle('B1:B4')->getAlignment()->setWrapText(true);
        $sheet->freezePane('A2');
    }
}
