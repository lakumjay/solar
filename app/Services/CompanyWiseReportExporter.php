<?php

namespace App\Services;

use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Color;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class CompanyWiseReportExporter
{
    private const GETCO_TITLE = '66kV SUBSTATION / GETCO END METER';

    private const GETCO_PANEL = 'Kashtabhajan Green Energy Panel';

    public function create(array $report): string
    {
        $book = new Spreadsheet;
        $sheet = $book->getActiveSheet();
        $sheet->setTitle('Company Report');
        $schema = $this->schema($report);
        $lastColumn = Coordinate::stringFromColumnIndex(count($schema));

        $this->writeBanners($sheet, $schema, $report['company']['name']);
        foreach ($schema as $index => $column) {
            $letter = Coordinate::stringFromColumnIndex($index + 1);
            $sheet->setCellValue($letter.'3', $column['label']);
            $sheet->setCellValue($letter.'4', $column['unit']);
        }

        $rowNumber = 5;
        foreach ($report['rows'] as $row) {
            foreach ($schema as $index => $column) {
                $letter = Coordinate::stringFromColumnIndex($index + 1);
                $value = match ($column['type']) {
                    'date' => ExcelDate::PHPToExcel(Carbon::parse($row['date'])),
                    'inverter' => $row['inverters'][(string) $column['id']] ?? null,
                    default => $row['meters'][$column['key']] ?? null,
                };
                $sheet->setCellValue($letter.$rowNumber, $value ?? '-');
            }
            $rowNumber++;
        }

        $this->style($sheet, $schema, $lastColumn, max($rowNumber - 1, 5));
        $sheet->freezePane('B5');
        $sheet->getPageSetup()->setOrientation(PageSetup::ORIENTATION_LANDSCAPE)->setFitToWidth(1)->setFitToHeight(0);
        $sheet->getPageMargins()->setTop(0.25)->setRight(0.25)->setBottom(0.25)->setLeft(0.25);
        $sheet->getPageSetup()->setRowsToRepeatAtTopByStartAndEnd(1, 4);

        $path = sys_get_temp_dir().'/company-wise-report-'.bin2hex(random_bytes(8)).'.xlsx';
        (new Xlsx($book))->save($path);
        $book->disconnectWorksheets();

        return $path;
    }

    private function schema(array $report): array
    {
        return [
            ['type' => 'date', 'label' => 'Date', 'unit' => '(તારીખ / Date)', 'group' => null],
            ...array_map(fn (array $inverter) => [
                'type' => 'inverter',
                'id' => $inverter['id'],
                'label' => $inverter['name'],
                'unit' => '(kWh)',
                'group' => 'inverter',
            ], $report['inverters']),
            ...array_map(fn (array $column) => [
                'type' => 'meter',
                'key' => $column['key'],
                'label' => $column['label'],
                'unit' => '(kWh)',
                'group' => $column['group'],
            ], $report['meter_columns']),
        ];
    }

    private function writeBanners(Worksheet $sheet, array $schema, string $companyName): void
    {
        $companyGroup = in_array('inverter', array_column($schema, 'group'), true) ? 'inverter' : null;
        $this->writeBanner($sheet, $schema, $companyGroup, 2, $companyName, '00F01A');

        foreach (['sub_import', 'sub_export'] as $group) {
            $positions = array_keys(array_filter($schema, fn (array $column) => $column['group'] === $group));
            if ($positions === []) {
                continue;
            }

            $start = Coordinate::stringFromColumnIndex(min($positions) + 1);
            $end = Coordinate::stringFromColumnIndex(max($positions) + 1);
            $sheet->mergeCells("{$start}1:{$end}1");
            $sheet->mergeCells("{$start}2:{$end}2");
            $sheet->setCellValue($start.'1', self::GETCO_TITLE);
            $sheet->setCellValue($start.'2', self::GETCO_PANEL);
            $sheet->getStyle("{$start}1:{$end}2")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('4A86E8');
            $sheet->getStyle("{$start}1:{$end}2")->getFont()->setColor(new Color('FFFFFFFF'))->setBold(true);
            $sheet->getStyle("{$start}1:{$end}2")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER);
        }
    }

    private function writeBanner(Worksheet $sheet, array $schema, ?string $group, int $row, string $value, string $color): void
    {
        $positions = array_keys(array_filter($schema, fn (array $column) => $column['group'] === $group));
        if ($positions === []) {
            return;
        }

        $start = Coordinate::stringFromColumnIndex(min($positions) + 1);
        $end = Coordinate::stringFromColumnIndex(max($positions) + 1);
        $sheet->mergeCells("{$start}{$row}:{$end}{$row}");
        $sheet->setCellValue($start.$row, $value);
        $sheet->getStyle("{$start}{$row}:{$end}{$row}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB($color);
        $sheet->getStyle("{$start}{$row}:{$end}{$row}")->getFont()->setBold(true);
        $sheet->getStyle("{$start}{$row}:{$end}{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER);
    }

    private function style(Worksheet $sheet, array $schema, string $lastColumn, int $lastRow): void
    {
        $sheet->getStyle("A3:{$lastColumn}4")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('FFF200');
        $sheet->getStyle("A3:{$lastColumn}4")->getFont()->setBold(true)->setColor(new Color('FF000000'));
        $sheet->getStyle("A3:{$lastColumn}4")->getAlignment()->setVertical(Alignment::VERTICAL_CENTER)->setWrapText(true);

        foreach ($schema as $index => $column) {
            $letter = Coordinate::stringFromColumnIndex($index + 1);
            $sheet->getColumnDimension($letter)->setWidth($column['type'] === 'date' ? 16 : max(14, min(27, strlen($column['label']) + 3)));
        }

        $sheet->getStyle('A3:A'.$lastRow)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        $sheet->getStyle("A3:{$lastColumn}{$lastRow}")->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_THIN)
            ->getColor()->setRGB('D9D9D9');
        $sheet->getStyle("A5:A{$lastRow}")->getNumberFormat()->setFormatCode('dd/mm/yyyy');
        if (count($schema) > 1) {
            $sheet->getStyle('B5:'.$lastColumn.$lastRow)->getNumberFormat()->setFormatCode('#,##0.00');
            $sheet->getStyle('B5:'.$lastColumn.$lastRow)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_RIGHT);
        }
        $sheet->getStyle("A1:{$lastColumn}{$lastRow}")->getFont()->setName('Arial')->setSize(10);
        $sheet->getStyle("A1:{$lastColumn}{$lastRow}")->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);
        $sheet->getRowDimension(1)->setRowHeight(22);
        $sheet->getRowDimension(2)->setRowHeight(22);
        $sheet->getRowDimension(3)->setRowHeight(27);
        $sheet->getRowDimension(4)->setRowHeight(22);
    }
}
