<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ExcelReportExporter
{
    public function create(array $data): string
    {
        $book = new Spreadsheet;
        $sheet = $book->getActiveSheet();
        $sheet->setTitle('Report');
        $sheet->mergeCells('A1:F1');
        $sheet->setCellValue('A1', 'SolarFlow '.ucfirst($data['period']).' Report');
        $sheet->setCellValue('A2', 'Period');
        $sheet->setCellValue('B2', $data['from'].' to '.$data['to']);
        if ($data['is_combined'] && $data['ss_reference']) {
            $sheet->setCellValue('D2', 'Daily SS reference company');
            $sheet->setCellValue('E2', $data['ss_reference']['company']);
            $sheet->setCellValue('A3', 'Missing reference dates');
            $sheet->mergeCells('B3:F3');
            $sheet->setCellValue('B3', $data['ss_reference']['missing_dates']
                ? implode(', ', $data['ss_reference']['missing_dates'])
                : 'None');
        }
        $headers = ['Period', 'All Inverter Total (kWh)', 'Plant Import Unit', 'Plant Export Unit', '66kV Sub Import Unit', '66kV Sub Export Unit'];
        $sheet->fromArray($headers, null, 'A4');
        $rowNumber = 5;

        foreach ($data['rows'] as $row) {
            $sheet->fromArray([$row['period'], $row['generation'], $row['plant_import'], $row['plant_export'], $row['sub_import'], $row['sub_export']], null, 'A'.$rowNumber++);
        }

        $sheet->setCellValue('A'.$rowNumber, 'Grand Total');
        $sheet->fromArray([$data['grand_total']['generation'], $data['grand_total']['plant_import'], $data['grand_total']['plant_export'], $data['grand_total']['sub_import'], $data['grand_total']['sub_export']], null, 'B'.$rowNumber);
        $this->styleTitle($sheet, 'A1:F1');
        $this->styleHeader($sheet, 'A4:F4');
        $sheet->getStyle("A{$rowNumber}:F{$rowNumber}")->getFont()->setBold(true);
        $sheet->getStyle("B5:F{$rowNumber}")->getNumberFormat()->setFormatCode('#,##0.00');
        $this->autoSize($sheet, 'F');
        $sheet->freezePane('A5');

        if ($data['company_totals']) {
            $companySheet = $book->createSheet();
            $companySheet->setTitle('Company Totals');
            $companySheet->fromArray(['Company', ...array_slice($headers, 1)], null, 'A1');
            $companyRow = 2;
            foreach ($data['company_totals'] as $total) {
                $companySheet->fromArray([$total['company'], $total['generation'], $total['plant_import'], $total['plant_export'], $total['sub_import'], $total['sub_export']], null, 'A'.$companyRow++);
            }
            $this->styleHeader($companySheet, 'A1:F1');
            $companySheet->getStyle("B2:F{$companyRow}")->getNumberFormat()->setFormatCode('#,##0.00');
            $this->autoSize($companySheet, 'F');
        }

        if ($data['inverter_totals']) {
            $inverterSheet = $book->createSheet();
            $inverterSheet->setTitle('Inverter Totals');
            $inverterSheet->fromArray(['Company', 'Inverter', 'Generation (kWh)'], null, 'A1');
            $inverterRow = 2;
            foreach ($data['inverter_totals'] as $total) {
                $inverterSheet->fromArray([$total['company'], $total['inverter'], $total['generation']], null, 'A'.$inverterRow++);
            }
            $this->styleHeader($inverterSheet, 'A1:C1');
            $inverterSheet->getStyle("C2:C{$inverterRow}")->getNumberFormat()->setFormatCode('#,##0.00');
            $this->autoSize($inverterSheet, 'C');
        }

        $book->setActiveSheetIndex(0);
        $path = sys_get_temp_dir().'/solarflow-report-'.bin2hex(random_bytes(8)).'.xlsx';
        (new Xlsx($book))->save($path);
        $book->disconnectWorksheets();

        return $path;
    }

    private function styleTitle(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->getFont()->setBold(true)->setSize(16)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($range)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('174C3B');
        $sheet->getStyle($range)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
    }

    private function styleHeader(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($range)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('2F7759');
    }

    private function autoSize(Worksheet $sheet, string $lastColumn): void
    {
        foreach (range('A', $lastColumn) as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }
    }
}
