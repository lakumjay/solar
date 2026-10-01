<?php

namespace App\Services;

use App\Models\User;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ExpenseExcelExporter
{
    public function create(array $report, User $user): string
    {
        $book = new Spreadsheet;

        if ($user->role === 'super_admin') {
            $this->createAdminLedger($book, $report);
            $this->createAllocationSheet($book, $report);
        } else {
            $this->createCompanyLedger($book, $report, $user);
        }

        $this->createBalanceSheet($book, $report);
        $book->setActiveSheetIndex(0);
        $path = sys_get_temp_dir().'/solarflow-expenses-'.bin2hex(random_bytes(8)).'.xlsx';
        (new Xlsx($book))->save($path);
        $book->disconnectWorksheets();

        return $path;
    }

    private function createAdminLedger(Spreadsheet $book, array $report): void
    {
        $sheet = $book->getActiveSheet();
        $sheet->setTitle('All Expenses');
        $this->title($sheet, 'All Company Expenses', $report, 'J');
        $sheet->fromArray(['Date', 'Entry Type', 'Description / Reference', 'Purchased By', 'Paying / From Company', 'To Company', 'Amount', 'Status', 'Notes', 'Entered By'], null, 'A4');
        $row = 5;

        foreach ($report['entries'] as $entry) {
            $settlement = $entry['type'] === 'settlement';
            $sheet->fromArray([
                $entry['date'],
                ucfirst(str_replace('_', ' ', $entry['type'])),
                $settlement ? 'Settlement payment' : $entry['description'],
                $settlement ? '' : $entry['purchaser_name'],
                data_get($entry, $settlement ? 'from_company.name' : 'payer_company.name'),
                $settlement ? data_get($entry, 'to_company.name') : '',
                $entry['amount'],
                ucfirst($entry['status']),
                $entry['notes'] ?? '',
                data_get($entry, 'created_by.name', ''),
            ], null, 'A'.$row++);
        }

        $this->finish($sheet, 'A4:J4', 'J', $row, ['G']);
    }

    private function createCompanyLedger(Spreadsheet $book, array $report, User $user): void
    {
        $companyName = $user->company?->name ?? 'Company';
        $sheet = $book->getActiveSheet();
        $sheet->setTitle('Company Expenses');
        $this->title($sheet, $companyName.' Expenses', $report, 'L');
        $sheet->fromArray(['Date', 'Entry Type', 'Description / Reference', 'Purchased By', 'Paying / From Company', 'To Company', 'Total Amount', 'Company %', 'Company Share', 'Net Effect (+ Receive / - Pay)', 'Status', 'Notes'], null, 'A4');
        $row = 5;

        foreach ($report['entries'] as $entry) {
            $settlement = $entry['type'] === 'settlement';
            if ($settlement) {
                $netEffect = (int) data_get($entry, 'to_company.id') === (int) $user->company_id
                    ? (float) $entry['amount']
                    : -1 * (float) $entry['amount'];
                $percentage = '';
                $share = '';
            } else {
                $allocation = collect($entry['allocations'])->first(fn ($row) => (int) data_get($row, 'company.id') === (int) $user->company_id);
                $percentage = $allocation ? (float) $allocation['percentage'] : 0;
                $share = $allocation ? (float) $allocation['amount'] : 0;
                $netEffect = (int) data_get($entry, 'payer_company.id') === (int) $user->company_id
                    ? (float) $entry['amount'] - $share
                    : -1 * $share;
            }

            $sheet->fromArray([
                $entry['date'],
                ucfirst(str_replace('_', ' ', $entry['type'])),
                $settlement ? 'Settlement payment' : $entry['description'],
                $settlement ? '' : $entry['purchaser_name'],
                data_get($entry, $settlement ? 'from_company.name' : 'payer_company.name'),
                $settlement ? data_get($entry, 'to_company.name') : '',
                $entry['amount'],
                $percentage,
                $share,
                round($netEffect, 2),
                ucfirst($entry['status']),
                $entry['notes'] ?? '',
            ], null, 'A'.$row++);
        }

        $this->finish($sheet, 'A4:L4', 'L', $row, ['G', 'H', 'I', 'J']);
    }

    private function createAllocationSheet(Spreadsheet $book, array $report): void
    {
        $sheet = $book->createSheet();
        $sheet->setTitle('Company Allocations');
        $sheet->fromArray(['Date', 'Expense ID', 'Entry Type', 'Description', 'Paying Company', 'Allocated Company', 'Percentage', 'Share Amount', 'Payer Share', 'Status'], null, 'A1');
        $row = 2;

        foreach ($report['entries'] as $entry) {
            if ($entry['type'] === 'settlement') {
                continue;
            }
            foreach ($entry['allocations'] as $allocation) {
                $sheet->fromArray([
                    $entry['date'],
                    $entry['id'],
                    ucfirst($entry['type']),
                    $entry['description'],
                    data_get($entry, 'payer_company.name'),
                    data_get($allocation, 'company.name'),
                    $allocation['percentage'],
                    $allocation['amount'],
                    $allocation['is_payer'] ? 'Yes' : 'No',
                    ucfirst($entry['status']),
                ], null, 'A'.$row++);
            }
        }

        $this->finish($sheet, 'A1:J1', 'J', $row, ['G', 'H'], 'A2');
    }

    private function createBalanceSheet(Spreadsheet $book, array $report): void
    {
        $sheet = $book->createSheet();
        $sheet->setTitle('Balances');
        $sheet->fromArray(['First Company', 'Second Company', 'Current Position', 'Amount', 'Status'], null, 'A1');
        $row = 2;

        foreach ($report['balances'] as $balance) {
            $position = $balance['status'] === 'cleared'
                ? 'No amount pending'
                : data_get($balance, 'debtor_company.name').' pays '.data_get($balance, 'creditor_company.name');
            $sheet->fromArray([
                data_get($balance, 'first_company.name'),
                data_get($balance, 'second_company.name'),
                $position,
                $balance['amount'],
                ucfirst($balance['status']),
            ], null, 'A'.$row++);
        }

        $this->finish($sheet, 'A1:E1', 'E', $row, ['D'], 'A2');
    }

    private function title(Worksheet $sheet, string $title, array $report, string $lastColumn): void
    {
        $sheet->mergeCells("A1:{$lastColumn}1");
        $sheet->setCellValue('A1', $title);
        $sheet->setCellValue('A2', 'Period');
        $sheet->setCellValue('B2', $report['from'].' to '.$report['to']);
        $sheet->getStyle("A1:{$lastColumn}1")->getFont()->setBold(true)->setSize(16)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle("A1:{$lastColumn}1")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('174C3B');
        $sheet->getStyle("A1:{$lastColumn}1")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
    }

    private function finish(Worksheet $sheet, string $headerRange, string $lastColumn, int $nextRow, array $numberColumns, string $freezePane = 'A5'): void
    {
        $sheet->getStyle($headerRange)->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($headerRange)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('2F7759');
        foreach (range('A', $lastColumn) as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }
        if ($nextRow > 2) {
            foreach ($numberColumns as $column) {
                $sheet->getStyle("{$column}2:{$column}".max(2, $nextRow - 1))->getNumberFormat()->setFormatCode('#,##0.00;[Red]-#,##0.00');
            }
        }
        $sheet->freezePane($freezePane);
        $sheet->setAutoFilter($headerRange);
    }
}
