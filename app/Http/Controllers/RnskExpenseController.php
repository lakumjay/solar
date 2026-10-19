<?php

namespace App\Http\Controllers;

use App\Models\RnskCompany;
use App\Models\RnskExpense;
use App\Services\RnskExpenseService;
use App\Services\SolarAccessService;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class RnskExpenseController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly RnskExpenseService $expenses,
    ) {}

    public function index(Request $request): array
    {
        return $this->report($request);
    }

    public function pdf(Request $request)
    {
        $report = $this->report($request);
        $user = $request->user();

        return Pdf::loadView('reports.rnsk-expenses', [
            'report' => $report,
            'user' => $user,
        ])
            ->setPaper('a4', 'portrait')
            ->setOption('isRemoteEnabled', true)
            ->setOption('defaultFont', 'DejaVu Sans')
            ->download("rnsk-expenses-{$report['from']}-to-{$report['to']}.pdf");
    }

    public function percentages(Request $request): array
    {
        abort_unless($this->canManage($request->user()), 403, 'Unauthorized.');
        $data = $request->validate([
            'companies' => ['required', 'array', 'min:1'],
            'companies.*.id' => ['nullable', 'integer'],
            'companies.*.name' => ['required', 'string', 'max:150'],
            'companies.*.percentage' => ['required', 'numeric', 'min:0', 'max:100'],
            'companies.*.active' => ['nullable', 'boolean'],
        ]);

        return $this->expenses->saveCompaniesAndPercentages($data['companies'], $request->user());
    }

    public function store(Request $request): array
    {
        abort_unless($this->canManage($request->user()), 403, 'Unauthorized.');
        $data = $request->validate([
            'expense_date' => ['required', 'date'],
            'payer_company_id' => ['required', 'integer'],
            'purchaser_name' => ['required', 'string', 'max:150'],
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'notes' => ['nullable', 'string'],
            'receipt' => ['nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
        ]);

        $expense = $this->expenses->createExpense(
            $data,
            $request->file('receipt'),
            $request->user(),
        );

        return ['message' => 'RNSK expense recorded.', 'expense' => $expense];
    }

    public function update(Request $request, RnskExpense $expense): array
    {
        abort_unless($this->canManage($request->user()), 403, 'Unauthorized.');
        $data = $request->validate([
            'expense_date' => ['required', 'date'],
            'payer_company_id' => ['required', 'integer'],
            'purchaser_name' => ['required', 'string', 'max:150'],
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'notes' => ['nullable', 'string'],
            'receipt' => ['nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
            'remove_receipt' => ['nullable', 'boolean'],
        ]);

        $updated = $this->expenses->updateExpense(
            $expense,
            $data,
            $request->file('receipt'),
            $request->user(),
        );

        return ['message' => 'RNSK expense updated.', 'expense' => $updated];
    }

    public function cancel(Request $request, RnskExpense $expense): array
    {
        abort_unless($this->canManage($request->user()), 403, 'Unauthorized.');
        $cancelled = $this->expenses->cancelExpense($expense, $request->user());

        return ['message' => 'RNSK expense cancelled.', 'expense' => $cancelled];
    }

    public function reverse(Request $request, RnskExpense $expense): array
    {
        abort_unless($this->canManage($request->user()), 403, 'Unauthorized.');
        $reversal = $this->expenses->reverseExpense($expense, $request->user());

        return ['message' => 'RNSK expense reversed.', 'expense' => $reversal];
    }

    public function settle(Request $request): array
    {
        abort_unless($this->canManage($request->user()), 403, 'Unauthorized.');
        $data = $request->validate([
            'settled_on' => ['required', 'date'],
            'from_company_id' => ['required', 'integer'],
            'to_company_id' => ['required', 'integer', 'different:from_company_id'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_mode' => ['nullable', 'string', 'max:50'],
            'payment_reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string'],
            'receipt' => ['nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
        ]);

        $settlement = $this->expenses->createSettlement(
            $data,
            $request->file('receipt'),
            $request->user(),
        );

        return ['message' => 'RNSK settlement recorded.', 'settlement' => $settlement];
    }

    public function receipt(Request $request, RnskExpense $expense)
    {
        abort_unless($expense->receipt_path && Storage::disk('local')->exists($expense->receipt_path), 404, 'Receipt not found.');

        return Storage::disk('local')->response(
            $expense->receipt_path,
            basename($expense->receipt_path),
            ['Content-Type' => Storage::disk('local')->mimeType($expense->receipt_path) ?: 'application/octet-stream']
        );
    }

    private function report(Request $request): array
    {
        $dates = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'company_id' => ['nullable', 'integer'],
        ]);

        $from = isset($dates['date_from']) ? Carbon::parse($dates['date_from']) : today()->startOfMonth();
        $to = isset($dates['date_to']) ? Carbon::parse($dates['date_to']) : today();
        $selectedCompanyId = isset($dates['company_id']) ? (int) $dates['company_id'] : null;

        return $this->expenses->dashboard($request->user(), $from, $to, $selectedCompanyId);
    }

    private function canManage($user): bool
    {
        return $user->role === 'super_admin' || (is_array($user->permissions) && in_array('manage_expenses', $user->permissions));
    }
}
